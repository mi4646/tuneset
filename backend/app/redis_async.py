"""异步 Redis 客户端. SSE pub/sub 用（FastAPI 异步端点）.

同步客户端见 redis_client.py（Celery 任务/限流用）.
"""
import redis.asyncio as aioredis

from app.config import settings

async_redis = aioredis.from_url(settings.redis_url, decode_responses=True)
