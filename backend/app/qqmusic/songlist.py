"""分享歌单歌曲拉取. 仿 fetch_fav_songs，供 /shared 端点复用."""
from app.qqmusic.client import QQMusicClient


async def fetch_songlist_songs(
    songlist_id: int, *, max: int | None = None
) -> tuple[list[dict], int]:
    """拉取分享歌单全部歌曲。返回 (songs_dict_list, total).

    max=None 不限，拉全部；传入正整数则截断到该数量。
    """
    async with QQMusicClient() as cli:
        songs: list = []
        total = 0
        page = 1
        while True:
            result = await cli.get_songlist_detail(songlist_id, num=50, page=page)
            if not total:
                total = result.total
            songs.extend(result.songs)
            if not result.hasmore or (max is not None and len(songs) >= max):
                break
            page += 1
        if max is not None and len(songs) > max:
            songs = songs[:max]
    return [s.model_dump() for s in songs], total
