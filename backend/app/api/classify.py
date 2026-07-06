"""分类工作流 HTTP 端点.

start → state → feedback（多轮 HITL）→ confirm（调 QQ API 建歌单）→ cancel
方案⑤：QQ 登录态不入 state，confirm 端点接收 credential 才调 QQ API。
"""

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.config import settings
from app.db.base import get_db
from app.models import User
from app.qqmusic.client import QQMusicClient
from app.qqmusic.credential_store import get_valid_credential
from app.ratelimit.deps import enforce_classify_limits
from app.redis_async import async_redis
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
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StartResponse:
    if not body.songs:
        raise HTTPException(status_code=400, detail="no songs")
    if len(body.songs) > settings.classify_max_songs:
        raise HTTPException(status_code=400, detail=f"max {settings.classify_max_songs} songs")
    # songs 校验通过后再限流（避免无效请求消耗间隔）
    enforce_classify_limits(user)
    thread_id = str(uuid.uuid4())
    songs = [s.model_dump() for s in body.songs]
    classify_task.delay(songs, user.id, thread_id)
    log_audit(
        db,
        user_id=user.id,
        thread_id=thread_id,
        action="classify_start",
        llm_calls=[],
        total_cost=0,
        status="running",
    )
    return StartResponse(thread_id=thread_id, status="running", proposal=[], iteration=0)


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


@router.get("/{thread_id}/stream")
async def classify_stream(thread_id: str):
    """SSE 推送分类进度. 事件类型：classify_progress / classify_ready / classify_failed.

    用 thread_id（uuid4）作凭证，仿 stream.py 的 stream_id 模式——EventSource 不带 JWT，
    故不走 get_current_user；thread_id 由 start 端点（已鉴权）返回，猜测难度足够。
    """
    graph = build_graph()
    state = graph.get_state({"configurable": {"thread_id": thread_id}})
    v = state.values if state and state.values else {}

    async def event_generator():
        status = v.get("status", "running")
        if status == "awaiting_feedback":
            yield f"event: classify_ready\ndata: {json.dumps({'status': 'awaiting_feedback', 'proposal': v.get('proposal', []), 'iteration': v.get('iteration', 0)}, ensure_ascii=False)}\n\n"
            return
        if status == "failed":
            yield f"event: classify_failed\ndata: {json.dumps({'status': 'failed', 'error': v.get('error', 'unknown')})}\n\n"
            return
        # running：推当前进度
        total = v.get("total_batches", 0)
        completed = v.get("completed_batches", 0)
        if total:
            yield f"event: classify_progress\ndata: {json.dumps({'completed': completed, 'total': total, 'status': 'running'})}\n\n"
        # 订阅 pubsub
        pubsub = async_redis.pubsub()
        await pubsub.subscribe(f"classify:progress:{thread_id}")
        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                raw = json.loads(message["data"])
                if raw.get("status") == "awaiting_feedback":
                    yield f"event: classify_ready\ndata: {json.dumps({'status': 'awaiting_feedback', 'proposal': raw.get('proposal', []), 'iteration': raw.get('iteration', 0)}, ensure_ascii=False)}\n\n"
                    return
                if raw.get("status") == "failed":
                    yield f"event: classify_failed\ndata: {json.dumps({'status': 'failed', 'error': raw.get('error', 'unknown')})}\n\n"
                    return
                yield f"event: classify_progress\ndata: {message['data']}\n\n"
        finally:
            await pubsub.unsubscribe(f"classify:progress:{thread_id}")
            await pubsub.close()

    return StreamingResponse(event_generator(), media_type="text/event-stream")


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
async def confirm(
    thread_id: str,
    body: ConfirmRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """调 QQ API 建歌单 + 精确添加（版本一致性命门）。credential 从服务端持久化取（方案⑤调整）。"""
    graph = build_graph()
    state = graph.get_state({"configurable": {"thread_id": thread_id}})
    if not state or not state.values:
        raise HTTPException(status_code=404, detail="thread not found")
    plan = state.values.get("plan")
    if not plan:
        raise HTTPException(status_code=400, detail="no plan, finalize first")

    cred = await get_valid_credential(db, user.id)

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

    results = await _do()
    return {"results": results}


@router.post("/{thread_id}/cancel")
def cancel(thread_id: str, user: User = Depends(get_current_user)):
    """取消分类（删 checkpoint）。TODO: 实际删 Redis checkpoint key."""
    return {"cancelled": True, "thread_id": thread_id}
