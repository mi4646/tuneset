# QQMusicApi 命门接口确认

> L-1124/QQMusicApi 已确认封装了 TuneSet 所需全部命门接口。
> 2026-07-03 通过 `git clone --depth 1` 到 `/tmp/qqma` 查源码确认。

- 仓库：https://github.com/L-1124/QQMusicApi
- 文档：https://l-1124.github.io/QQMusicApi
- 安装：`pip install qqmusic-api-python`

## 命门接口清单

| 能力 | 方法 | 说明 |
|---|---|---|
| 扫码登录 | `LoginApi.get_qrcode` / `check_qrcode` | 有 `QRCodeLoginSession` 封装，支持 QQ/微信/移动端二维码；`refresh_credential` 刷新、`check_expired` 检测过期 |
| 创建歌单 | `SonglistApi.create(dirname, credential)` | 返回 dirid |
| **添加歌曲到歌单** | `SonglistApi.add_songs(dirid, song_info, tid=0, credential)` | `song_info: list[tuple[int,int]]`，每项 `(song_id, song_type)`，**按 song_id 精确添加**，调 `PlaylistDetailWrite/AddSonglist`，`require_login=True`，retCode==0 即成功 |
| 获取"我喜欢" | `UserApi.get_fav_song(euin, page, num)` | dirid=201 是"我喜欢"固定 ID，需 euin（加密 UIN） |
| 获取歌词 | `LyricApi.get_lyric` | |
| 获取歌曲详情 | `SongApi.get_detail(value)` | |
| 获取歌曲标签 | `SongApi.get_labels(songid)` | 分类依据来源 |
| 获取歌单详情 | `SonglistApi.get_detail` | 分享链接入口用 |
| 其他版本 | `SongApi.get_other_version(value)` | 识别用户喜欢的具体版本 |

## 关键说明

- **版本一致性的底层保证**：`add_songs` 按 `song_id` 精确添加，不是按歌名模糊匹配。这是绕开 QQ音乐导入版本错配的关键。
- **song_id vs songmid**：`add_songs` 用 `song_id`（int）+ `song_type`（int），不是 songmid（字符串）。但 `get_fav_song` 返回的歌曲对象两者都有，直接传即可。
- **euin**：`get_fav_song` 需要 `euin`（加密 UIN），非明文 QQ 号。登录后可拿到，注意转换。euin 属用户隐私，公开服务下勿泄露。
- **登录态**：`Credential` 对象可序列化，但按方案⑤不持久化存储，会话级前端持有。
