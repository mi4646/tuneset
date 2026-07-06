"""分类提示词."""

import json

CLASSIFY_SYSTEM = """你是一个音乐分类助手。根据歌曲信息（歌名、歌手、标签、歌词），将歌曲分到合适的歌单类别。

可选类别（可按需扩展）：华语流行、粤语、古风、欧美、电子、民谣、说唱、摇滚、R&B、日韩、纯音乐、其他。

返回严格的 JSON 数组，每项格式：
{"song_id": <int>, "song_type": <int>, "category": <string>, "reason": <string>}"""

CLASSIFY_USER_TEMPLATE = """请对以下歌曲分类：

{songs_json}

返回 JSON 数组。"""

MERGE_SYSTEM = """你是一个音乐分类归一化助手。输入是多批歌曲的分类提案，可能存在同义不同名的类别（如"摇滚"/"Rock"/"rock"）。
你的任务：
1. 合并同义类别名为统一名称（优先用中文常用名）
2. 跨批同类歌曲归到同一类别
3. 输出统一的提案列表，每项 {"song_id", "song_type", "category", "reason"}
返回严格的 JSON 数组。"""

MERGE_USER_TEMPLATE = """请归一化以下分批分类提案：

{batch_proposals_json}

返回合并后的 JSON 数组。"""


def build_classify_prompt(songs_json: str) -> tuple[str, str]:
    """返回 (system, user) 提示词."""
    return CLASSIFY_SYSTEM, CLASSIFY_USER_TEMPLATE.format(songs_json=songs_json)


def build_merge_prompt(batch_proposals_json: str) -> tuple[str, str]:
    """返回 (system, user) 提示词，用于归一化分批提案."""
    return MERGE_SYSTEM, MERGE_USER_TEMPLATE.format(batch_proposals_json=batch_proposals_json)


def build_refine_prompt(songs_json: str, feedback: dict, current_proposal_json: str) -> tuple[str, str]:
    """返回 (system, user) 提示词，用于带反馈的 refine."""
    user = CLASSIFY_USER_TEMPLATE.format(songs_json=songs_json)
    user += f"\n\n用户反馈：{json.dumps(feedback, ensure_ascii=False)}"
    user += f"\n\n当前合并提案：{current_proposal_json}"
    return CLASSIFY_SYSTEM, user
