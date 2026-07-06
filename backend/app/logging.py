"""纯文本日志配置. 基于 loguru，人类可读 + 文件持久化 + rotation.

调用方式兼容 structlog 风格：log.info("event_name", field=value)
规范见 CLAUDE.md "日志规范" 章节.
"""
import logging
import sys
from datetime import timezone
from typing import Any

from loguru import logger

from app.config import settings


def mask(value: str | None, keep: int = 4) -> str:
    """脱敏：保留前后各 keep 位，中间用 *** 代替. 短串全掩."""
    if not value or len(value) <= keep * 2:
        return "***"
    return f"{value[:keep]}***{value[-keep:]}"


class InterceptHandler(logging.Handler):
    """拦截标准 logging（uvicorn 等）转发到 loguru，统一输出."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno
        frame, depth = logging.currentframe(), 2
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1
        logger.bind(logger_name=record.name).opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


# 纯文本 format：时间(UTC) | 级别(左对齐8位) | logger名 | event | 业务字段 k=v
_LOG_FORMAT = "{extra[_ts]} | {level: <8} | {extra[logger_name]} | {message}{extra[_kv]}"

# 元字段（不作为业务字段输出到 k=v 段）
_META_KEYS = {"logger_name", "_ts", "_kv"}


def _text_patcher(record: dict) -> None:
    """patcher：统一时间 UTC、补 logger 名、拼业务字段 k=v.

    纯文本格式下替代 JSON 序列化，保留可读的结构化字段.
    """
    utc_time = record["time"].astimezone(timezone.utc)
    record["extra"]["_ts"] = utc_time.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    record["extra"]["logger_name"] = record["extra"].get("logger_name") or "-"
    parts = [f"{k}={v}" for k, v in record["extra"].items() if k not in _META_KEYS]
    record["extra"]["_kv"] = (" | " + " ".join(parts)) if parts else ""


def _health_check_filter(record: dict) -> bool:
    """过滤 /api/health 200 access log，避免健康检查淹没业务日志."""
    msg = record.get("message", "")
    if "/api/health" in msg and msg.rstrip().endswith(" 200"):
        return False
    return True


_initialized = False


def setup_logging() -> None:
    """初始化 loguru. 幂等，多次调用仅首次生效.

    在应用入口（backend: main.py import 时；worker/beat: celery setup_logging 信号）调用.
    双输出：stdout（docker logs）+ 文件（持久化，rotation，多进程安全 via enqueue）.
    纯文本格式，人类可读. 标准 logging（uvicorn/celery 等）通过 InterceptHandler 转发到 loguru.
    """
    global _initialized
    if _initialized:
        return
    _initialized = True
    logger.remove()
    logger.configure(patcher=_text_patcher)
    # intercept uvicorn/celery 标准 logging 到 loguru
    # 不拦截 root logger，避免影响第三方库（qqmusic_api/httpx 等）
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error", "celery", "celery.task"):
        lg = logging.getLogger(name)
        lg.handlers = [InterceptHandler()]
        lg.propagate = False
        lg.setLevel(logging.DEBUG)  # 不在标准 logging 层过滤，交由 loguru sink level 控制
    # stdout（docker logs 仍可用）
    logger.add(
        sys.stdout,
        format=_LOG_FORMAT,
        level="INFO",
        filter=_health_check_filter,
        diagnose=False,
    )
    # 文件（持久化 + rotation + 多进程安全）
    logger.add(
        settings.log_file,
        format=_LOG_FORMAT,
        rotation=settings.log_max_bytes,
        retention=settings.log_backup_count,
        compression="zip",
        level="INFO",
        enqueue=True,  # 多进程安全（celery worker prefork）
        encoding="utf-8",
        filter=_health_check_filter,
        diagnose=False,
    )


class _StructlogLikeLogger:
    """兼容 structlog 调用风格的 loguru 包装：log.info(event, field=value).

    第一个参数 positional-only（_event），避免业务字段名 event 冲突.
    """

    def __init__(self, name: str | None = None):
        self._name = name

    def _log(self, level: str, _event: str, /, **kwargs: Any) -> None:
        extra: dict[str, Any] = {}
        if self._name:
            extra["logger_name"] = self._name
        extra.update(kwargs)
        logger.bind(**extra).log(level, _event)

    def info(self, _event: str, /, **kwargs: Any) -> None:
        self._log("INFO", _event, **kwargs)

    def warning(self, _event: str, /, **kwargs: Any) -> None:
        self._log("WARNING", _event, **kwargs)

    def error(self, _event: str, /, **kwargs: Any) -> None:
        self._log("ERROR", _event, **kwargs)

    def debug(self, _event: str, /, **kwargs: Any) -> None:
        self._log("DEBUG", _event, **kwargs)


def get_logger(name: str | None = None) -> _StructlogLikeLogger:
    """获取结构化 logger."""
    return _StructlogLikeLogger(name)
