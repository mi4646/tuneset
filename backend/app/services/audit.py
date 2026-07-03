"""审计日志服务. 记录分类流程的 AI 调用 + 成本，落 SQLite."""

import json

from sqlalchemy.orm import Session

from app.models import AuditLog


def log_audit(
    db: Session,
    *,
    user_id: int | None,
    thread_id: str,
    action: str,
    llm_calls: list | None = None,
    total_cost: float = 0.0,
    status: str = "started",
) -> AuditLog:
    """插入一条审计日志. action 如 classify_start/finalize/confirm/cancel."""
    log = AuditLog(
        user_id=user_id,
        thread_id=thread_id,
        action=action,
        llm_calls=json.dumps(llm_calls or [], ensure_ascii=False),
        total_cost=total_cost,
        status=status,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
