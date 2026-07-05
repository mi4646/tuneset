from fastapi import APIRouter, HTTPException

from qqmusic_api import Credential

from app.logging import get_logger, mask
from app.qqmusic.client import QQMusicClient
from app.qqmusic.fav import fetch_fav_songs
from app.schemas.qq import FavSongRequest, SharedSonglistRequest

router = APIRouter()
log = get_logger(__name__)


@router.post("/favorite")
async def get_favorite(body: FavSongRequest):
    """取"我喜欢"歌曲（dirid=201）。euin 从 credential.encrypt_uin 自动提取（方案⑤前端持有）。"""
    cred = Credential(**body.credential)
    cred_keys = sorted(body.credential.keys())
    log.info(
        "fav_request",
        has_encrypt_uin=bool(cred.encrypt_uin),
        encrypt_uin_masked=mask(cred.encrypt_uin),
        credential_keys=cred_keys,
    )
    if not cred.encrypt_uin:
        log.warning("fav_request_no_euin", credential_keys=cred_keys)
        raise HTTPException(
            status_code=400,
            detail="credential 缺少 encrypt_uin，请重新扫码登录",
        )
    songs, total = await fetch_fav_songs(cred)
    log.info(
        "fav_loaded",
        encrypt_uin_masked=mask(cred.encrypt_uin),
        total=total,
        returned=len(songs),
        truncated=total > len(songs),
    )
    return {"songs": songs, "total": total}


@router.post("/shared")
async def get_shared(body: SharedSonglistRequest):
    """取分享歌单歌曲（无需登录态）。"""
    async with QQMusicClient() as cli:
        result = await cli.get_songlist_detail(body.songlist_id, num=50)
    return result
