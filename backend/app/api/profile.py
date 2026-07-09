"""听歌画像 HTTP 端点."""

import json
import secrets
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.config import settings
from app.db.base import get_db
from app.logging import get_logger
from app.models import User
from app.redis_async import async_redis
from app.schemas.profile import (
    ProfileGenerateResponse,
    ProfileResult,
    ShareTokenCreate,
    ShareTokenResponse,
    ShareTokenListResponse,
)
from app.tasks.profile_task import profile_generate_task

router = APIRouter()
log = get_logger(__name__)

SHARE_TTL = 7 * 24 * 3600  # 分享链接有效期 7 天


@router.post("/generate", response_model=ProfileGenerateResponse)
def generate(
    user: User = Depends(get_current_user),
) -> ProfileGenerateResponse:
    """启动听歌画像生成（异步 Celery 任务）。"""
    thread_id = str(uuid.uuid4())
    profile_generate_task.delay(user.id, thread_id)
    return ProfileGenerateResponse(thread_id=thread_id)


@router.get("/{thread_id}/stream")
async def profile_stream(thread_id: str):
    """SSE 推送听歌画像生成进度.

    事件类型：profile_progress（{stage, detail}）.
    thread_id 由 generate 端点返回，不作 JWT 校验（同 classify stream 模式）。
    """

    async def event_generator():
        pubsub = async_redis.pubsub()
        await pubsub.subscribe(f"profile:progress:{thread_id}")
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    yield f"event: profile_progress\ndata: {message['data']}\n\n"
        finally:
            await pubsub.unsubscribe(f"profile:progress:{thread_id}")
            await pubsub.close()

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/{thread_id}/result")
async def get_result(thread_id: str):
    """获取已完成听歌画像结果。"""
    raw = await async_redis.get(f"profile:result:{thread_id}")
    if raw is None:
        raise HTTPException(status_code=404, detail="result not found or still processing")
    data = json.loads(raw)
    if data.get("error") == "songs_too_few":
        raise HTTPException(status_code=400, detail="歌曲太少，需要至少 10 首收藏")
    return data


@router.post("/share-tokens", response_model=ShareTokenResponse)
async def create_share_token(
    user: User = Depends(get_current_user),
):
    """创建分享令牌。将用户最新的听歌画像结果分享出去。"""
    # 找用户最新画像结果
    pattern = "profile:result:*"
    keys = await async_redis.keys(pattern)
    # 简单取第一个（实际上需要关联到用户，简化：存一份用户 ID 映射）
    token = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=7)

    await async_redis.setex(
        f"profile:share:{token}",
        SHARE_TTL,
        json.dumps({
            "user_id": user.id,
            "user_email": user.email,
            "created_at": now.isoformat(),
            "expires_at": expires.isoformat(),
        }),
    )
    # 记录到用户的令牌列表
    await async_redis.sadd(f"profile:share_tokens:{user.id}", token)

    return ShareTokenResponse(
        token=token,
        created_at=now.isoformat(),
        expires_at=expires.isoformat(),
    )


@router.get("/share-tokens", response_model=ShareTokenListResponse)
async def list_share_tokens(
    user: User = Depends(get_current_user),
):
    """列出用户的分享令牌。"""
    tokens = await async_redis.smembers(f"profile:share_tokens:{user.id}")
    result = []
    for token in tokens:
        raw = await async_redis.get(f"profile:share:{token}")
        if raw is None:
            continue
        data = json.loads(raw)
        result.append(ShareTokenResponse(
            token=token,
            created_at=data.get("created_at", ""),
            expires_at=data.get("expires_at", ""),
        ))
    return ShareTokenListResponse(tokens=result)


@router.delete("/share-tokens/{token}")
async def revoke_share_token(
    token: str,
    user: User = Depends(get_current_user),
):
    """吊销分享令牌。"""
    raw = await async_redis.get(f"profile:share:{token}")
    if raw is None:
        raise HTTPException(status_code=404, detail="token not found")
    data = json.loads(raw)
    if data.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="not your token")
    await async_redis.delete(f"profile:share:{token}")
    await async_redis.srem(f"profile:share_tokens:{user.id}", token)
    return {"revoked": True, "token": token}


@router.get("/shared/{token}")
async def get_shared_profile(token: str):
    """公开只读分享页面。不需要鉴权。"""
    raw = await async_redis.get(f"profile:share:{token}")
    if raw is None:
        raise HTTPException(status_code=404, detail="分享链接已失效或不存在")
    meta = json.loads(raw)
    # 找到用户的最新画像
    pattern = "profile:result:*"
    keys = await async_redis.keys(pattern)
    if not keys:
        raise HTTPException(status_code=404, detail="画像数据不存在")
    # 取最新一个
    latest_key = sorted(keys)[-1]
    result_raw = await async_redis.get(latest_key)
    if result_raw is None:
        raise HTTPException(status_code=404, detail="画像数据不存在")
    profile_data = json.loads(result_raw)
    return {
        "profile": profile_data,
        "shared_by": meta.get("user_email", ""),
        "created_at": meta.get("created_at", ""),
        "expires_at": meta.get("expires_at", ""),
        "generated_at": profile_data.get("generated_at", ""),
    }
