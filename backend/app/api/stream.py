"""SSE 推送端点. 我喜欢列表实时更新.

subscribe 端点：前端 POST credential，后端缓存 + 返回 stream_id + 首批数据.
stream 端点：EventSource 订阅，后端通过 Redis pub/sub 推送更新.
"""
import json
import secrets

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from qqmusic_api.core.exceptions import NetworkError
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.config import settings
from app.db.base import get_db
from app.logging import get_logger, mask
from app.models import User
from app.qqmusic.credential_store import get_valid_credential
from app.qqmusic.fav import fetch_fav_songs
from app.redis_async import async_redis
from app.schemas.qq import SubscribeResponse

router = APIRouter()
log = get_logger(__name__)


@router.post("/songlist/favorite/subscribe", response_model=SubscribeResponse)
async def subscribe_favorite(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """订阅"我喜欢"实时推送. 返回 stream_id + 首批数据. credential 从服务端持久化取（方案⑤调整）。"""
    try:
        cred = await get_valid_credential(db, user.id)
        if not cred.encrypt_uin:
            raise HTTPException(
                status_code=400,
                detail="credential 缺少 encrypt_uin，请重新扫码登录",
            )
        euin = cred.encrypt_uin
        cred_json = cred.model_dump_json()
        ttl = settings.fav_push_interval * 2
        # 缓存 credential（活跃标记 + 后续刷新用）
        await async_redis.setex(f"fav:cred:{euin}", ttl, cred_json)
        # 首次：若无缓存，同步调 QQ 填充；有缓存直接返回
        cache_raw = await async_redis.get(f"fav:cache:{euin}")
        if cache_raw is None:
            try:
                songs, total = await fetch_fav_songs(cred)
            except NetworkError:
                # QQ 接口偶发超时，重试 1 次（重试仍失败则由外层 except 返回 502）
                log.warning("fav_subscribe_retry", encrypt_uin_masked=mask(euin), reason="首次超时,重试 1 次")
                songs, total = await fetch_fav_songs(cred)
            cache_data = json.dumps({"songs": songs, "total": total})
            await async_redis.setex(f"fav:cache:{euin}", ttl, cache_data)
            log.info("fav_subscribe_init", encrypt_uin_masked=mask(euin), total=total)
        else:
            cache = json.loads(cache_raw)
            songs, total = cache["songs"], cache["total"]
            log.info("fav_subscribe_cache", encrypt_uin_masked=mask(euin), total=total)
        # 生成 stream_id
        stream_id = secrets.token_urlsafe(16)
        await async_redis.setex(f"fav:stream:{stream_id}", 60, euin)
        return SubscribeResponse(
            stream_id=stream_id,
            songs=songs,
            total=total,
            interval=settings.fav_push_interval,
        )
    except NetworkError as e:
        # QQ 音乐接口超时/网络异常：502 + 脱敏日志，避免 500 与 Credential 经 traceback 泄露
        log.warning("fav_subscribe_failed", reason="QQ音乐接口超时", error=type(e).__name__)
        raise HTTPException(status_code=502, detail="QQ音乐接口暂时不可用，请稍后重试")


@router.get("/stream/{stream_id}")
async def stream(stream_id: str):
    """SSE 推送. EventSource 订阅."""
    euin = await async_redis.get(f"fav:stream:{stream_id}")
    if euin is None:
        raise HTTPException(status_code=404, detail="stream expired")

    async def event_generator():
        # 立即推送当前缓存
        cache_raw = await async_redis.get(f"fav:cache:{euin}")
        if cache_raw:
            yield f"event: fav_update\ndata: {cache_raw}\n\n"
        # subscribe pub/sub
        pubsub = async_redis.pubsub()
        await pubsub.subscribe(f"fav:update:{euin}")
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    yield f"event: fav_update\ndata: {message['data']}\n\n"
        finally:
            await pubsub.unsubscribe(f"fav:update:{euin}")
            await pubsub.close()

    return StreamingResponse(event_generator(), media_type="text/event-stream")
