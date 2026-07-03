from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import auth, health, qq, songlist
from app.config import settings
from app.ratelimit.middleware import IPRateLimitMiddleware
from qqmusic_api import ApiException

app = FastAPI(title="TuneSet")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(IPRateLimitMiddleware)

app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api/auth")
app.include_router(qq.router, prefix="/api/qq")
app.include_router(songlist.router, prefix="/api/songlist")


@app.exception_handler(ApiException)
async def qq_api_exception_handler(request: Request, exc: ApiException) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": f"QQ API error: {exc}"})
