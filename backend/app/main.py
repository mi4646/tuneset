from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import auth, classify, health, qq, songlist, stream
from app.config import settings
from app.db.base import ensure_superadmin, init_db
from app.logging import get_logger, setup_logging
from app.ratelimit.middleware import IPRateLimitMiddleware
from qqmusic_api import ApiException

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    init_db()
    ensure_superadmin()
    yield


app = FastAPI(title="TuneSet", lifespan=lifespan)

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
