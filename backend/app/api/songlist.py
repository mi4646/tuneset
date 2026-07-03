from fastapi import APIRouter

from qqmusic_api import Credential

from app.qqmusic.client import QQMusicClient
from app.schemas.qq import FavSongRequest, SharedSonglistRequest

router = APIRouter()


@router.post("/favorite")
async def get_favorite(body: FavSongRequest):
    """取"我喜欢"歌曲（dirid=201）。需 euin + credential（方案⑤前端持有）。"""
    cred = Credential(**body.credential)
    async with QQMusicClient(cred) as cli:
        result = await cli.get_fav_song(body.euin, num=50, credential=cred)
    return result


@router.post("/shared")
async def get_shared(body: SharedSonglistRequest):
    """取分享歌单歌曲（无需登录态）。"""
    async with QQMusicClient() as cli:
        result = await cli.get_songlist_detail(body.songlist_id, num=50)
    return result
