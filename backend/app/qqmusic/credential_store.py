"""QQ credential 持久化 + 自动刷新（方案⑤调整）。

按 TuneSet user_id 关联，加密存 SQLite，跨会话/跨设备共享。
musickey 过期时用 refresh_token 自动刷新，避免重复扫码（根治 20279 设备超限）。
"""
import json

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.logging import get_logger, mask
from app.models.user import User
from app.qqmusic.client import QQMusicClient
from app.security.crypto import decrypt, encrypt
from qqmusic_api import Credential
from qqmusic_api.core.exceptions import CredentialRefreshError

log = get_logger(__name__)


def save_credential(db: Session, user_id: int, cred_dict: dict) -> None:
    """持久化 QQ credential（加密）+ 脱敏 euin。"""
    user = db.scalar(select(User).where(User.id == user_id))
    if user is None:
        return
    user.qq_credential_enc = encrypt(json.dumps(cred_dict, ensure_ascii=False))
    euin = cred_dict.get("encrypt_uin", "")
    user.qq_euin_masked = mask(euin) if euin else None
    db.commit()
    log.info("qq_credential_saved", user_id=user_id, has_euin=bool(euin))


def get_credential(db: Session, user_id: int) -> Credential | None:
    """读取并解密 credential。未绑定返回 None。"""
    user = db.scalar(select(User).where(User.id == user_id))
    if not user or not user.qq_credential_enc:
        return None
    cred_dict = json.loads(decrypt(user.qq_credential_enc))
    return Credential(**cred_dict)


def get_euin_masked(db: Session, user_id: int) -> str | None:
    """返回脱敏 euin（展示用，不暴露完整 credential）。"""
    user = db.scalar(select(User).where(User.id == user_id))
    return user.qq_euin_masked if user else None


async def get_valid_credential(db: Session, user_id: int) -> Credential:
    """获取有效 credential：过期自动 refresh，refresh 失败提示重扫。"""
    cred = get_credential(db, user_id)
    if cred is None:
        raise HTTPException(status_code=400, detail="QQ 未绑定，请先扫码登录")
    if not cred.is_expired():
        return cred
    try:
        async with QQMusicClient() as cli:
            new_cred = await cli.refresh_credential(cred)
    except CredentialRefreshError as e:
        log.warning("qq_credential_refresh_failed", user_id=user_id, error=str(e))
        raise HTTPException(status_code=401, detail="QQ 登录已过期，请重新扫码")
    save_credential(db, user_id, new_cred.model_dump())
    log.info("qq_credential_refreshed", user_id=user_id)
    return new_cred


def clear_credential(db: Session, user_id: int) -> None:
    """解绑 QQ：清空存储的 credential。"""
    user = db.scalar(select(User).where(User.id == user_id))
    if user is None:
        return
    user.qq_credential_enc = None
    user.qq_euin_masked = None
    db.commit()
    log.info("qq_credential_cleared", user_id=user_id)
