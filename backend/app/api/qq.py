import base64
import pickle

from fastapi import APIRouter, Depends, HTTPException
from qqmusic_api import ApiException
from qqmusic_api.core.exceptions import NetworkError
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.base import get_db
from app.logging import get_logger, mask
from app.models import User
from app.qqmusic.client import QQMusicClient
from app.qqmusic.credential_store import (
    clear_credential,
    get_euin_masked,
    save_credential,
)
from app.redis_client import redis_client as _redis
from app.schemas.qq import (
    CheckQrRequest,
    CheckQrResponse,
    QrCodeResponse,
    QqStatusResponse,
)

router = APIRouter()
log = get_logger(__name__)
_QR_KEY = "qq:qr:{identifier}"
_QR_TTL = 300  # 二维码 5 分钟有效


@router.post("/qrcode", response_model=QrCodeResponse)
async def get_qrcode() -> QrCodeResponse:
    async with QQMusicClient() as cli:
        qr = await cli.get_qrcode()
    _redis.setex(_QR_KEY.format(identifier=qr.identifier), _QR_TTL, pickle.dumps(qr))
    log.info("qq_qrcode_issued", identifier=qr.identifier)
    return QrCodeResponse(
        image_base64=base64.b64encode(qr.data).decode(),
        identifier=qr.identifier,
    )


@router.post("/check", response_model=CheckQrResponse)
async def check_qrcode(
    body: CheckQrRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CheckQrResponse:
    key = _QR_KEY.format(identifier=body.identifier)
    raw = _redis.get(key)
    if raw is None:
        raise HTTPException(status_code=404, detail="QR expired or not found")
    qr = pickle.loads(raw)
    try:
        async with QQMusicClient() as cli:
            result = await cli.check_qrcode(qr)
    except NetworkError as e:
        log.warning("qq_check_network_error", error=str(e))
        return CheckQrResponse(done=False, event="NETWORK_ERROR")
    except ApiException as e:
        code = getattr(e, "code", -1)
        log.warning("qq_check_api_error", error=str(e), code=code)
        if code == 20279:
            return CheckQrResponse(done=False, event="DEVICE_LIMIT")
        return CheckQrResponse(done=False, event="QQ_API_ERROR")
    event_name = result.event.name if hasattr(result.event, "name") else str(result.event)
    resp = CheckQrResponse(done=result.done, event=event_name)
    if result.done and result.credential is not None:
        cred_dict = result.credential.model_dump()
        log.info(
            "qq_login_done",
            user_id=user.id,
            has_encrypt_uin=bool(cred_dict.get("encrypt_uin")),
            encrypt_uin_masked=mask(cred_dict.get("encrypt_uin", "")),
            musicid=cred_dict.get("musicid"),
            credential_keys=sorted(cred_dict.keys()),
        )
        # 方案⑤调整：服务端持久化加密 credential，跨会话/跨设备共享
        save_credential(db, user.id, cred_dict)
        resp.bound = True
        resp.credential = cred_dict  # 兼容前端旧逻辑，阶段 4 移除
        _redis.delete(key)  # 登录完成，QR 不再需要
    else:
        log.info("qq_check_progress", qq_event=event_name, done=result.done)
    return resp


@router.get("/status", response_model=QqStatusResponse)
async def qq_status(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> QqStatusResponse:
    """查询当前用户是否已绑定 QQ 音乐（方案⑤调整：服务端持久化）。"""
    euin_masked = get_euin_masked(db, user.id)
    return QqStatusResponse(bound=euin_masked is not None, euin_masked=euin_masked)


@router.post("/unbind")
async def qq_unbind(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """解绑当前用户的 QQ 音乐登录态，清除服务端持久化的 credential。"""
    clear_credential(db, user.id)
    log.info("qq_unbind_done", user_id=user.id)
    return {"ok": True}
