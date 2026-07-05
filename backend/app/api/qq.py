import base64
import pickle

from fastapi import APIRouter, HTTPException

from app.logging import get_logger, mask
from app.qqmusic.client import QQMusicClient
from app.redis_client import redis_client as _redis
from app.schemas.qq import CheckQrRequest, CheckQrResponse, QrCodeResponse

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
async def check_qrcode(body: CheckQrRequest) -> CheckQrResponse:
    key = _QR_KEY.format(identifier=body.identifier)
    raw = _redis.get(key)
    if raw is None:
        raise HTTPException(status_code=404, detail="QR expired or not found")
    qr = pickle.loads(raw)
    async with QQMusicClient() as cli:
        result = await cli.check_qrcode(qr)
    event_name = result.event.name if hasattr(result.event, "name") else str(result.event)
    resp = CheckQrResponse(done=result.done, event=event_name)
    if result.done and result.credential is not None:
        cred_dict = result.credential.model_dump()
        log.info(
            "qq_login_done",
            has_encrypt_uin=bool(cred_dict.get("encrypt_uin")),
            encrypt_uin_masked=mask(cred_dict.get("encrypt_uin", "")),
            musicid=cred_dict.get("musicid"),
            credential_keys=sorted(cred_dict.keys()),
        )
        resp.credential = cred_dict
        _redis.delete(key)  # 登录完成，QR 不再需要
    else:
        log.info("qq_check_progress", qq_event=event_name, done=result.done)
    return resp
