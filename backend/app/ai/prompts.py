"""分类提示词."""

CLASSIFY_SYSTEM = """你是一个音乐分类助手。根据歌曲信息（歌名、歌手、标签、歌词），将歌曲分到合适的歌单类别。

可选类别（可按需扩展）：华语流行、粤语、古风、欧美、电子、民谣、说唱、摇滚、R&B、日韩、纯音乐、其他。

返回严格的 JSON 数组，每项格式：
{"song_id": <int>, "song_type": <int>, "category": <string>, "reason": <string>}"""

CLASSIFY_USER_TEMPLATE = """请对以下歌曲分类：

{songs_json}

返回 JSON 数组。"""


def build_classify_prompt(songs_json: str) -> tuple[str, str]:
    """返回 (system, user) 提示词."""
    return CLASSIFY_SYSTEM, CLASSIFY_USER_TEMPLATE.format(songs_json=songs_json)
