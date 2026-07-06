from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import auth, classify, health, qq, songlist, stream
from app.config import settings
from app.db.base import ensure_superadmin, init_db
from app.logging import get_logger, setup_logging
from app.ratelimit.middleware import IPRateLimitMiddleware
from qqmusic_api import ApiException

setup_logging()
log = get_logger(__name__)


def _read_version() -> str:
    """读取项目根 VERSION 文件作为后端运行时版本。
    本地: backend/app/main.py → parents[2] = 项目根
    容器: /app/app/main.py → parents[2] = /，回退到挂载点 /app/VERSION
    """
    candidates = [
        Path(__file__).resolve().parents[2] / "VERSION",
        Path("/app/VERSION"),
    ]
    for p in candidates:
        if p.exists():
            return p.read_text().strip()
    return "0.0.0+unknown"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    ensure_superadmin()
    yield


app = FastAPI(title="TuneSet", version=_read_version(), lifespan=lifespan)

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
app.include_router(classify.router, prefix="/api/classify")
app.include_router(stream.router, prefix="/api")


@app.exception_handler(ApiException)
async def qq_api_exception_handler(request: Request, exc: ApiException) -> JSONResponse:
    log.warning(
        "qq_api_exception",
        path=request.url.path,
        error=str(exc),
        code=getattr(exc, "code", -1),
    )
    return JSONResponse(status_code=400, content={"detail": f"QQ API error: {exc}"})
