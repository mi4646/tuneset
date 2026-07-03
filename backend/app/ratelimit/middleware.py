"""IP 级限流中间件. 每 IP 每小时 rate_limit_ip_hourly 次（防刷注册/登录）."""

import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings
from app.redis_client import redis_client

_IP_KEY = "rl:ip:{ip}:{hour}"


class IPRateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # health 不限流
        if request.url.path.startswith("/api/health"):
            return await call_next(request)
        ip = request.client.host if request.client else "unknown"
        hour = int(time.time() // 3600)
        key = _IP_KEY.format(ip=ip, hour=hour)
        count = redis_client.incr(key)
        if count == 1:
            redis_client.expire(key, 3600)
        if count > settings.rate_limit_ip_hourly:
            return JSONResponse(status_code=429, content={"detail": "IP rate limit exceeded"})
        return await call_next(request)
