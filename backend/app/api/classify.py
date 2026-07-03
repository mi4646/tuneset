"""分类工作流 HTTP 端点.

start → state → feedback（多轮 HITL）→ confirm（调 QQ API 建歌单）→ cancel
方案⑤：QQ 登录态不入 state，confirm 端点接收 credential 才调 QQ API。
"""

import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException
from qqmusic_api import Credential
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.config import settings
from app.db.base import get_db
from app.models import User
from app.qqmusic.client import QQMusicClient
from app.ratelimit.deps import check_classify_interval
from app.schemas.classify import (
    ConfirmRequest,
    FeedbackRequest,
    StartRequest,
    StartResponse,
    StateResponse,
)
from app.services.audit import log_audit
from app.tasks.classify_task import classify_resume_task, classify_task
from app.workflow.graph import build_graph

router = APIRouter()


@router.post("/start", response_model=StartResponse)
def start(
    body: StartRequest,
    user: User = Depends(check_classify_interval),
    db: Session = Depends(get_db),
) -> StartResponse:
    if not body.songs:
        raise HTTPException(status_code=400, detail="no songs")
    if len(body.songs) > settings.classify_max_songs:
        raise HTTPException(status_code=400, detail=f"max {settings.classify_max_songs} songs")
    thread_id = str(uuid.uuid4())
    songs = [s.model_dump() for s in body.songs]
    res = classify_task.delay(songs, user.id, thread_id).get(timeout=120)
    log_audit(
        db,
        user_id=user.id,
        thread_id=thread_id,
        action="classify_start",
        llm_calls=res.get("llm_calls", []),
        total_cost=sum(c.get("cost", 0) for c in res.get("llm_calls", [])),
        status="awaiting_feedback",
    )
    return StartResponse(
        thread_id=thread_id,
        status=res["status"],
        proposal=res["proposal"],
        iteration=res["iteration"],
    )


@router.get("/{thread_id}", response_model=StateResponse)
def get_state(thread_id: str, user: User = Depends(get_current_user)) -> StateResponse:
    graph = build_graph()
    state = graph.get_state({"configurable": {"thread_id": thread_id}})
    if not state or not state.values:
        raise HTTPException(status_code=404, detail="thread not found")
    v = state.values
    return StateResponse(
        thread_id=thread_id,
        status=v.get("status", ""),
        proposal=v.get("proposal"),
        iteration=v.get("iteration", 0),
        plan=v.get("plan"),
    )


@router.post("/{thread_id}/feedback", response_model=StartResponse)
def feedback(
    thread_id: str,
    body: FeedbackRequest,
    user: User = Depends(get_current_user),
) -> StartResponse:
    res = classify_resume_task.delay(
        thread_id, body.feedback_text, body.feedback_drag
    ).get(timeout=120)
    return StartResponse(
        thread_id=thread_id,
        status=res["status"],
        proposal=res.get("proposal", []),
        iteration=res.get("iteration", 0),
    )


@router.post("/{thread_id}/confirm")
def confirm(
    thread_id: str,
    body: ConfirmRequest,
    user: User = Depends(get_current_user),
):
    """调 QQ API 建歌单 + 精确添加（版本一致性命门）。credential 前端持有。"""
    graph = build_graph()
    state = graph.get_state({"configurable": {"thread_id": thread_id}})
    if not state or not state.values:
        raise HTTPException(status_code=404, detail="thread not found")
    plan = state.values.get("plan")
    if not plan:
        raise HTTPException(status_code=400, detail="no plan, finalize first")

    cred = Credential(**body.credential)

    async def _do():
        results = []
        async with QQMusicClient(cred) as cli:
            for category, songs in plan.items():
                dirid = await cli.create_songlist(
                    body.dirname_template.format(category=category), cred
                )
                ok = await cli.add_songs(dirid, [(s[0], s[1]) for s in songs], cred)
                results.append({"category": category, "dirid": dirid, "added": ok})
        return results

    results = asyncio.run(_do())
    return {"results": results}


@router.post("/{thread_id}/cancel")
def cancel(thread_id: str, user: User = Depends(get_current_user)):
    """取消分类（删 checkpoint）。TODO: 实际删 Redis checkpoint key."""
    return {"cancelled": True, "thread_id": thread_id}
