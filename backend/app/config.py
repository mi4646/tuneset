from pathlib import Path

from dotenv import load_dotenv
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# 显式加载根 .env（本地开发用）；容器内由 compose env_file 注入环境变量，
# 根 .env 不存在时 load_dotenv 静默跳过，不报错
_ROOT = Path(__file__).resolve().parents[2]  # backend/app/config.py → 项目根
load_dotenv(_ROOT / ".env", override=False)

# 密钥类配置的无效值黑名单（生产环境拒绝）
_WEAK_SECRETS = {"", "change-me", "<改>"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")  # 仅读环境变量，不读 env_file

    # 应用
    app_env: str = "development"
    secret_key: str = "change-me"

    # 数据库
    sqlite_path: str = "./data/tuneset.db"

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # JWT
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1440
    jwt_refresh_token_expire_days: int = 30

    # 注册
    public_registration_enabled: bool = False
    invite_code_required: bool = True

    # 超管（启动时若不存在则创建，已存在则跳过；两者都配才生效）
    superadmin_email: str = ""
    superadmin_password: str = ""

    # 我喜欢推送
    fav_push_interval: int = 300  # 推送/缓存刷新间隔（秒）

    # 日志（loguru，文件持久化 + rotation）
    log_file: str = "/app/logs/app.log"  # 日志文件路径（容器内，docker volume 挂载宿主机）
    log_max_bytes: int = 10 * 1024 * 1024  # 单文件最大字节，超出 rotation（默认 10MB）
    log_backup_count: int = 5  # 保留旧日志文件数

    # 限流
    rate_limit_user_daily: int = 30
    rate_limit_ip_hourly: int = 20
    rate_limit_classify_interval: int = 30
    classify_max_songs: int = 200
    classify_max_iterations: int = 5

    # AI
    ai_protocol: str = "openai"
    ai_base_url: str = "https://api.openai.com/v1"
    ai_api_key: str = ""
    ai_model: str = "gpt-4o-mini"

    # Celery
    celery_broker_url: str = "redis://redis:6379/1"
    celery_result_backend: str = "redis://redis:6379/2"

    # LangSmith
    langsmith_tracing: bool = False
    langsmith_api_key: str = ""

    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]

    @model_validator(mode="after")
    def _validate_production_secrets(self) -> "Settings":
        """生产环境强制校验密钥类配置，拒绝默认/空值"""
        if self.app_env != "production":
            return self
        if self.secret_key in _WEAK_SECRETS:
            raise ValueError("生产环境 SECRET_KEY 必须配置为有效值（禁止 change-me/<改>/空）")
        if self.ai_api_key in _WEAK_SECRETS:
            raise ValueError("生产环境 AI_API_KEY 必须配置为有效值")
        if self.superadmin_password in _WEAK_SECRETS:
            raise ValueError("生产环境 SUPERADMIN_PASSWORD 必须配置为有效值")
        return self


settings = Settings()
