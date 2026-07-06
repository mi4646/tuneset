"""IP 级限流中间件. 仅对注册/登录端点生效（防刷账号）.

分类等业务端点靠用户级日限 + 分类间隔控制（见 ratelimit/deps.py）。
全局 IP 限流会误伤 NAT 网络下的正常用户，故收窄到账号防刷场景。
"""

import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings
from app.redis_client import redis_client

_IP_KEY = "rl:ip:{ip}:{hour}"
# 仅对这些路径做 IP 限流（防刷注册/登录）
_PROTECTED_PATHS = {"/api/auth/register", "/api/auth/login"}


class IPRateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path not in _PROTECTED_PATHS:
            return await call_next(request)
        ip = request.client.host if request.client else "unknown"
        hour = int(time.time() // 3600)
        key = _IP_KEY.format(ip=ip, hour=hour)
        count = redis_client.incr(key)
        if count == 1:
            redis_client.expire(key, 3600)
        if count > settings.rate_limit_ip_hourly:
            return JSONResponse(
                status_code=429,
                content={"detail": "IP 请求过于频繁，请稍后再试"},
            )
        return await call_next(request)
