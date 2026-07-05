from fastapi import APIRouter, HTTPException

from qqmusic_api import Credential

from app.qqmusic.client import QQMusicClient
from app.schemas.qq import FavSongRequest, SharedSonglistRequest

router = APIRouter()

_FAV_MAX = 500  # "我喜欢"拉取上限，防止极端账号拖慢响应


@router.post("/favorite")
async def get_favorite(body: FavSongRequest):
    """取"我喜欢"歌曲（dirid=201）。euin 从 credential.encrypt_uin 自动提取（方案⑤前端持有）。"""
    cred = Credential(**body.credential)
    if not cred.encrypt_uin:
        raise HTTPException(
            status_code=400,
            detail="credential 缺少 encrypt_uin，请重新扫码登录",
        )
    async with QQMusicClient(cred) as cli:
        songs: list = []
        total = 0
        page = 1
        while True:
            result = await cli.get_fav_song(
                cred.encrypt_uin, page=page, num=50, credential=cred
            )
            if not total:
                total = result.total
            songs.extend(result.songs)
            if not result.hasmore or len(songs) >= _FAV_MAX:
                break
            page += 1
        if len(songs) > _FAV_MAX:
            songs = songs[:_FAV_MAX]
    return {"songs": songs, "total": total}


@router.post("/shared")
async def get_shared(body: SharedSonglistRequest):
    """取分享歌单歌曲（无需登录态）。"""
    async with QQMusicClient() as cli:
        result = await cli.get_songlist_detail(body.songlist_id, num=50)
    return result
