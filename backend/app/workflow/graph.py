"""分类工作流 graph 构建.

LangGraph StateGraph + RedisSaver checkpointer（按 thread_id 跨 HTTP 请求维持状态）。
"""

from langgraph.checkpoint.redis import RedisSaver
from langgraph.graph import END, START, StateGraph

from app.config import settings
from app.workflow.nodes import (
    await_feedback_node,
    batch_propose_node,
    finalize_node,
    merge_node,
    refine_node,
    route_after_batch,
    route_after_feedback,
    split_node,
)
from app.workflow.state import ClassifyState


def build_graph():
    """构建分类工作流 graph. 每次调用建新 checkpointer（避免模块级 redis 连接）."""
    builder = StateGraph(ClassifyState)
    builder.add_node("split", split_node)
    builder.add_node("batch_propose", batch_propose_node)
    builder.add_node("merge", merge_node)
    builder.add_node("await_feedback", await_feedback_node)
    builder.add_node("refine", refine_node)
    builder.add_node("finalize", finalize_node)
    builder.add_edge(START, "split")
    builder.add_edge("split", "batch_propose")
    builder.add_conditional_edges("batch_propose", route_after_batch)
    builder.add_edge("merge", "await_feedback")
    builder.add_edge("refine", "await_feedback")
    builder.add_conditional_edges("await_feedback", route_after_feedback)
    builder.add_edge("finalize", END)
    checkpointer = RedisSaver(redis_url=settings.redis_url)
    checkpointer.setup()  # 创建 RediSearch 索引（幂等）
    return builder.compile(checkpointer=checkpointer)
