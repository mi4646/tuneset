"""用户级限流. classify 端点用.

enforce_classify_limits: 合并每日上限（控 AI 成本）+ 分类间隔（防高频 start）。
songs 数量校验应在调用前完成，避免无效请求消耗间隔。
"""

import time

from fastapi import HTTPException

from app.config import settings
from app.models import User
from app.redis_client import redis_client

_USER_DAILY_KEY = "rl:user:{uid}:{date}"
_CLASSIFY_INTERVAL_KEY = "rl:classify:{uid}"


def enforce_classify_limits(user: User) -> None:
    """分类限流：先查每日上限（控成本），再查间隔（防高频）.

    songs 数量校验应在调用此函数前完成——避免无效请求消耗间隔。
    """
    # 1. 每日上限（控 AI 成本）
    date = time.strftime("%Y%m%d")
    daily_key = _USER_DAILY_KEY.format(uid=user.id, date=date)
    count = redis_client.incr(daily_key)
    if count == 1:
        redis_client.expire(daily_key, 86400)
    if count > settings.rate_limit_user_daily:
        raise HTTPException(
            status_code=429,
            detail=f"已达每日分类上限 {settings.rate_limit_user_daily} 次",
        )
    # 2. 间隔限流（防高频 start）
    interval_key = _CLASSIFY_INTERVAL_KEY.format(uid=user.id)
    ttl = redis_client.ttl(interval_key)
    if ttl > 0:
        raise HTTPException(
            status_code=429,
            detail=f"操作过于频繁，{ttl} 秒后重试",
        )
    redis_client.setex(interval_key, settings.rate_limit_classify_interval, "1")
