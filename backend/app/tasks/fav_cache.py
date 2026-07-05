"""Celery 周期任务：刷新所有活跃用户的"我喜欢"缓存.

beat 每 fav_push_interval 秒触发，扫描 fav:cred:* keys，
对每个活跃 euin 调 QQ 接口更新缓存并 publish 通知 SSE 端点.
"""
import asyncio
import json

from qqmusic_api import Credential

from app.config import settings
from app.logging import get_logger, mask
from app.qqmusic.fav import fetch_fav_songs
from app.redis_client import redis_client
from app.tasks.celery_app import celery

log = get_logger(__name__)


@celery.task(name="refresh_fav_cache")
def refresh_fav_cache() -> dict:
    """周期刷新所有活跃 euin 的"我喜欢"缓存并 publish. Celery beat 触发."""
    asyncio.run(_refresh_all())
    return {"status": "ok"}


async def _refresh_all() -> None:
    for key in redis_client.scan_iter("fav:cred:*"):
        euin = key.decode().split(":", 2)[2] if isinstance(key, bytes) else key.split(":", 2)[2]
        cred_raw = redis_client.get(key)
        if cred_raw is None:
            continue
        cred_dict = json.loads(cred_raw)
        cred = Credential(**cred_dict)
        try:
            songs, total = await fetch_fav_songs(cred)
            cache_data = json.dumps({"songs": songs, "total": total})
            ttl = settings.fav_push_interval * 2
            redis_client.setex(f"fav:cache:{euin}", ttl, cache_data)
            redis_client.publish(f"fav:update:{euin}", cache_data)
            log.info("fav_refreshed", encrypt_uin_masked=mask(euin), total=total)
        except Exception as e:
            log.error("fav_refresh_failed", encrypt_uin_masked=mask(euin), error=str(e))
            redis_client.publish(f"fav:update:{euin}", json.dumps({"error": str(e)}))
