"""分类异步任务. graph.invoke 到 await_feedback interrupt 返回 proposal.

Celery task 同步执行；LangGraph compiled graph.invoke 同步；ai_provider.chat 同步。
方案⑤：QQ 登录态不入 state，confirm 端点才调 QQ API。
"""

import json

from app.db.base import SessionLocal
from app.redis_client import redis_client
from app.services.audit import log_audit
from app.tasks.celery_app import celery
from app.workflow.graph import build_graph


@celery.task(name="classify")
def classify_task(songs: list, user_id: int, thread_id: str) -> dict:
    """首轮分类. graph 跑 split → batch_propose(×N) → merge → await_feedback(interrupt) 返回 proposal."""
    graph = build_graph()
    config = {"configurable": {"thread_id": thread_id}}
    try:
        result = graph.invoke(
            {"songs": songs, "user_id": user_id, "thread_id": thread_id},
            config=config,
        )
    except Exception as e:
        redis_client.publish(
            f"classify:progress:{thread_id}",
            json.dumps({"status": "failed", "error": str(e)}),
        )
        raise
    # 跑到 await_feedback interrupt 返回，result 是当前 state
    llm_calls = result.get("llm_calls", [])
    total_cost = sum(c.get("cost", 0) for c in llm_calls)
    with SessionLocal() as db:
        log_audit(
            db,
            user_id=user_id,
            thread_id=thread_id,
            action="classify_propose_done",
            llm_calls=llm_calls,
            total_cost=total_cost,
            status="awaiting_feedback",
        )
    return {
        "status": result.get("status"),
        "proposal": result.get("proposal"),
        "iteration": result.get("iteration", 0),
        "llm_calls": llm_calls,
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
