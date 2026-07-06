from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.base import get_db
from app.logging import get_logger, mask
from app.models import User
from app.qqmusic.credential_store import get_valid_credential
from app.qqmusic.fav import fetch_fav_songs
from app.qqmusic.songlist import fetch_songlist_songs
from app.schemas.qq import SharedSonglistRequest

router = APIRouter()
log = get_logger(__name__)


@router.post("/favorite")
async def get_favorite(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """取"我喜欢"歌曲（dirid=201）。credential 从服务端持久化取（方案⑤调整）。"""
    cred = await get_valid_credential(db, user.id)
    log.info(
        "fav_request",
        user_id=user.id,
        has_encrypt_uin=bool(cred.encrypt_uin),
        encrypt_uin_masked=mask(cred.encrypt_uin),
    )
    if not cred.encrypt_uin:
        log.warning("fav_request_no_euin", user_id=user.id)
        raise HTTPException(
            status_code=400,
            detail="credential 缺少 encrypt_uin，请重新扫码登录",
        )
    songs, total = await fetch_fav_songs(cred)
    log.info(
        "fav_loaded",
        user_id=user.id,
        encrypt_uin_masked=mask(cred.encrypt_uin),
        total=total,
        returned=len(songs),
        truncated=total > len(songs),
    )
    return {"songs": songs, "total": total}


@router.post("/shared")
async def get_shared(body: SharedSonglistRequest):
    """取分享歌单歌曲（无需登录态）。"""
    songs, total = await fetch_songlist_songs(body.songlist_id)
    return {"songs": songs, "total": total}
