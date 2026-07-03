import base64
import pickle

from fastapi import APIRouter, HTTPException

from app.qqmusic.client import QQMusicClient
from app.redis_client import redis_client as _redis
from app.schemas.qq import CheckQrRequest, CheckQrResponse, QrCodeResponse

router = APIRouter()
_QR_KEY = "qq:qr:{identifier}"
_QR_TTL = 300  # 二维码 5 分钟有效


@router.post("/qrcode", response_model=QrCodeResponse)
async def get_qrcode() -> QrCodeResponse:
    async with QQMusicClient() as cli:
        qr = await cli.get_qrcode()
    _redis.setex(_QR_KEY.format(identifier=qr.identifier), _QR_TTL, pickle.dumps(qr))
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
        resp.credential = result.credential.model_dump()
        _redis.delete(key)  # 登录完成，QR 不再需要
    return resp
