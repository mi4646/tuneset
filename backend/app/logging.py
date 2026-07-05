"""结构化日志配置. 基于 structlog，JSON 输出.

规范见 CLAUDE.md "日志规范" 章节.
"""
import logging

import structlog


def mask(value: str | None, keep: int = 4) -> str:
    """脱敏：保留前后各 keep 位，中间用 *** 代替. 短串全掩."""
    if not value or len(value) <= keep * 2:
        return "***"
    return f"{value[:keep]}***{value[-keep:]}"


def setup_logging() -> None:
    """初始化 structlog. 在 FastAPI lifespan 启动时调用一次."""
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None):
    """获取结构化 logger."""
    return structlog.get_logger(name)
