"""分类异步任务. graph.invoke 到 await_feedback interrupt 返回 proposal.

Celery task 同步执行；LangGraph compiled graph.invoke 同步；ai_provider.chat 同步。
方案⑤：QQ 登录态不入 state，confirm 端点才调 QQ API。
"""

from app.tasks.celery_app import celery
from app.workflow.graph import build_graph


@celery.task(name="classify")
def classify_task(songs: list, user_id: int, thread_id: str) -> dict:
    """首轮分类. graph 跑 propose → await_feedback(interrupt) 返回 proposal."""
    graph = build_graph()
    config = {"configurable": {"thread_id": thread_id}}
    result = graph.invoke(
        {"songs": songs, "user_id": user_id, "thread_id": thread_id},
        config=config,
    )
    return {
        "status": result.get("status"),
        "proposal": result.get("proposal"),
        "iteration": result.get("iteration", 0),
        "llm_calls": result.get("llm_calls", []),
    }


@celery.task(name="classify_resume")
def classify_resume_task(thread_id: str, feedback_text: str | None, feedback_drag: list | None) -> dict:
    """用户提交反馈后继续 graph. Command(resume=feedback) 跳出 interrupt → refine/finalize."""
    from langgraph.types import Command

    graph = build_graph()
    config = {"configurable": {"thread_id": thread_id}}
    result = graph.invoke(
        Command(resume={"feedback_text": feedback_text, "feedback_drag": feedback_drag}),
        config=config,
    )
    return {
        "status": result.get("status"),
        "proposal": result.get("proposal"),
        "iteration": result.get("iteration", 0),
        "plan": result.get("plan"),
        "llm_calls": result.get("llm_calls", []),
    }
