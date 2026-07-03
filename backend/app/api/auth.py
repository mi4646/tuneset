from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.jwt import create_access_token, create_refresh_token, decode_token
from app.auth.security import hash_password, verify_password
from app.config import settings
from app.db.base import get_db
from app.models import InviteCode, User
from app.schemas.auth import (
    AccessTokenResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> User:
    # 注册开关：关闭且不需邀请码 → 无注册途径
    if not settings.public_registration_enabled and not settings.invite_code_required:
        raise HTTPException(status_code=403, detail="Registration disabled")

    # 邀请码校验
    invite: InviteCode | None = None
    if settings.invite_code_required:
        if not body.invite_code:
            raise HTTPException(status_code=400, detail="Invite code required")
        invite = db.scalar(select(InviteCode).where(InviteCode.code == body.invite_code))
        if invite is None or invite.used_by is not None:
            raise HTTPException(status_code=400, detail="Invalid invite code")

    # email 去重
    if db.scalar(select(User).where(User.email == body.email)) is not None:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(email=body.email, password_hash=hash_password(body.password))
    db.add(user)
    db.flush()
    if invite is not None:
        invite.used_by = user.id
        invite.used_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == body.email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Inactive user")
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=AccessTokenResponse)
def refresh(body: RefreshRequest) -> AccessTokenResponse:
    try:
        payload = decode_token(body.refresh_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    return AccessTokenResponse(access_token=create_access_token(user_id))


@router.get("/me", response_model=UserResponse)
def me(current: User = Depends(get_current_user)) -> User:
    return current
