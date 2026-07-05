from collections.abc import Generator

from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    f"sqlite:///{settings.sqlite_path}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _migrate_users_is_superuser() -> None:
    """开发期轻量迁移：旧 db 缺 is_superuser 列时补上。生产应迁到 alembic。"""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("users")}
    if "is_superuser" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_superuser BOOLEAN DEFAULT 0"))


def init_db() -> None:
    """建表。开发期用 create_all；生产迁移后续引入 alembic。"""
    from app.models import AuditLog, InviteCode, User  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _migrate_users_is_superuser()


def ensure_superadmin() -> None:
    """幂等初始化超管用户。.env 未配 SUPERADMIN_EMAIL/PASSWORD 则跳过。
    已存在但密码与 .env 不符时更新密码（支持改密后重启生效）。"""
    if not settings.superadmin_email or not settings.superadmin_password:
        return
    from app.auth.security import hash_password, verify_password
    from app.models import User

    with SessionLocal() as db:
        existing = db.scalar(select(User).where(User.email == settings.superadmin_email))
        if existing is None:
            user = User(
                email=settings.superadmin_email,
                password_hash=hash_password(settings.superadmin_password),
                is_superuser=True,
            )
            db.add(user)
            db.commit()
            return
        if not verify_password(settings.superadmin_password, existing.password_hash):
            existing.password_hash = hash_password(settings.superadmin_password)
            db.commit()
