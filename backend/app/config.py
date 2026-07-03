from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

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


settings = Settings()
