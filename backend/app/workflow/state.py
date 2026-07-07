"""分类工作流 state schema.

设计原则（可检测/可回退/可持续）：
- llm_calls: 记录每次 AI 调用（模型/token/成本/时间），供审计
- checkpoint_ids: LangGraph checkpoint id 列表，支持撤销
- iteration: 当前轮次，配合 classify_max_iterations 限轮
- plan: finalize 输出的建歌单计划，confirm 端点消费
"""

from typing import TypedDict


class SongItem(TypedDict, total=False):
    song_id: int
    song_type: int
    name: str
    singer: str
    labels: list[str]
    lyric: str | None


class ProposalItem(TypedDict, total=False):
    song_id: int
    song_type: int
    category: str
    reason: str


class DragFeedback(TypedDict, total=False):
    song_id: int
    from_category: str
    to_category: str


class LLMCall(TypedDict, total=False):
    model: str
    input_tokens: int
    output_tokens: int
    cost: float
    timestamp: str


class ClassifyState(TypedDict, total=False):
    # 输入
    songs: list[SongItem]
    user_id: int
    thread_id: str
    # 分批
    batches: list[list[SongItem]]
    batch_index: int
    batch_proposals: list[list[ProposalItem]]
    total_batches: int
    completed_batches: int
    # AI 输出
    proposal: list[ProposalItem]
    # 用户反馈
    feedback_text: str
    feedback_drag: list[DragFeedback]
    # 轮次
    iteration: int
    # 审计
    llm_calls: list[LLMCall]
    checkpoint_ids: list[str]
    # 状态
    status: str
    error: str
    plan: dict
