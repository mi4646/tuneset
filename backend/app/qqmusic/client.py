"""QQ 音乐 API 客户端封装.

封装 L-1124/QQMusicApi (v0.6.8)。Client 是核心，集成 login/song/songlist/user/lyric。
用法：async with QQMusicClient(credential) as c: await c.get_fav_song(...)

命门接口：add_songs 按 (song_id, song_type) 精确添加，绕开 QQ 音乐导入版本错配。
"""

from typing import Any

from qqmusic_api import Client, Credential
from qqmusic_api.models.login import QR, QRLoginResult, QRLoginType


class QQMusicClient:
    """L-1124/QQMusicApi 薄封装：统一入口 + 类型注解 + 隐藏 import 路径."""

    def __init__(self, credential: Credential | None = None) -> None:
        self._client = Client(credential=credential)

    async def __aenter__(self) -> "QQMusicClient":
        await self._client.__aenter__()
        # qqmusic_api 0.6.8 的 Client 不暴露 timeout 入口，默认 30s connect / 120s read；
        # 扫码授权场景 120s read 太长（网络抖动时用户卡死），缩短到 connect=5s / read=10s
        self._client._session.timeout = (5, 10)
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        await self._client.__aexit__(exc_type, exc_val, exc_tb)

    # ---- 扫码登录（方案⑤：credential 会话级前端持有，服务端不存）----
    async def get_qrcode(self, login_type: QRLoginType = QRLoginType.QQ) -> QR:
        return await self._client.login.get_qrcode(login_type)

    async def check_qrcode(self, qrcode: QR) -> QRLoginResult:
        return await self._client.login.check_qrcode(qrcode)

    # ---- 歌曲信息（分类依据：详情 + 标签，缺标签补歌词）----
    async def get_song_detail(self, value: int | str):
        return await self._client.song.get_detail(value)

    async def get_labels(self, songid: int):
        return await self._client.song.get_labels(songid)

    async def get_other_version(self, value: int | str):
        return await self._client.song.get_other_version(value)

    async def get_lyric(self, value: int | str):
        return await self._client.lyric.get_lyric(value)

    # ---- 歌单（"我喜欢" dirid=201；分享链接入口用 get_songlist_detail）----
    async def get_fav_song(
        self,
        euin: str,
        *,
        page: int = 1,
        num: int = 10,
        credential: Credential | None = None,
    ):
        return await self._client.user.get_fav_song(euin, page, num, credential=credential)

    async def get_songlist_detail(self, songlist_id: int, *, num: int = 10, page: int = 1):
        return await self._client.songlist.get_detail(songlist_id, num=num, page=page)

    # ---- 建歌单 + 精确添加（版本一致性命门）----
    async def create_songlist(self, dirname: str, credential: Credential):
        return await self._client.songlist.create(dirname, credential=credential)

    async def add_songs(
        self,
        dirid: int,
        song_info: list[tuple[int, int]],
        credential: Credential,
    ) -> bool:
        return await self._client.songlist.add_songs(dirid, song_info, credential=credential)
