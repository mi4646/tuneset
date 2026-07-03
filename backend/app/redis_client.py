"""共享 Redis 客户端. 限流/QR 临时存储/checkpoint 复用."""

import redis

from app.config import settings

redis_client: redis.Redis = redis.from_url(settings.redis_url)
