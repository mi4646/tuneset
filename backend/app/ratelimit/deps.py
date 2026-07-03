"""用户级 + 频率限流依赖. classify 端点用."""

import time

from fastapi import Depends, HTTPException

from app.auth.deps import get_current_user
from app.config import settings
from app.models import User
from app.redis_client import redis_client

_USER_DAILY_KEY = "rl:user:{uid}:{date}"
_CLASSIFY_INTERVAL_KEY = "rl:classify:{uid}"


def check_user_daily(user: User = Depends(get_current_user)) -> User:
    """每用户每天 rate_limit_user_daily 次."""
    date = time.strftime("%Y%m%d")
    key = _USER_DAILY_KEY.format(uid=user.id, date=date)
    count = redis_client.incr(key)
    if count == 1:
        redis_client.expire(key, 86400)
    if count > settings.rate_limit_user_daily:
        raise HTTPException(status_code=429, detail="Daily classify limit exceeded")
    return user


def check_classify_interval(user: User = Depends(get_current_user)) -> User:
    """每次分类间隔 rate_limit_classify_interval 秒."""
    key = _CLASSIFY_INTERVAL_KEY.format(uid=user.id)
    ttl = redis_client.ttl(key)
    if ttl > 0:
        raise HTTPException(status_code=429, detail=f"Too frequent, retry in {ttl}s")
    redis_client.setex(key, settings.rate_limit_classify_interval, "1")
    return user
