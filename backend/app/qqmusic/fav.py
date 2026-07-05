"""我喜欢歌曲拉取. 抽出供 /favorite 端点 + subscribe 端点 + Celery 刷新任务复用."""
from qqmusic_api import Credential

from app.qqmusic.client import QQMusicClient

_FAV_MAX = 500  # "我喜欢"拉取上限，防止极端账号拖慢响应


async def fetch_fav_songs(cred: Credential, *, max: int = _FAV_MAX) -> tuple[list[dict], int]:
    """拉取"我喜欢"全部歌曲（dirid=201）。返回 (songs_dict_list, total)."""
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
            if not result.hasmore or len(songs) >= max:
                break
            page += 1
        if len(songs) > max:
            songs = songs[:max]
    return [s.model_dump() for s in songs], total
