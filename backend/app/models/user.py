from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    # QQ 音乐绑定（方案⑤调整：服务端持久化加密 credential，跨会话/跨设备共享）
    qq_credential_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    qq_euin_masked: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
