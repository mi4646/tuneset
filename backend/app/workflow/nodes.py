"""分类工作流节点.

流程：propose → await_feedback(interrupt) → [refine → await_feedback]* → finalize
最多 classify_max_iterations 轮 refine，超轮或用户确认 → finalize。
finalize 不调 QQ API，只生成建歌单计划；confirm 端点才调 QQ API（QQ 登录态不入 state）。
"""

import json
from datetime import datetime, timezone

from langgraph.types import interrupt

from app.ai.pricing import estimate_cost
from app.ai.prompts import build_classify_prompt
from app.ai.provider import ai_provider
from app.config import settings
from app.workflow.state import ClassifyState


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_json(text: str) -> list:
    """从 AI 返回解析 JSON 数组（容错：去 markdown fence）."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    return json.loads(text)


def _classify(state: ClassifyState, feedback: dict | None) -> dict:
    songs = state.get("songs", [])
    songs_json = json.dumps(songs, ensure_ascii=False)
    system, user = build_classify_prompt(songs_json)
    if feedback:
        user += f"\n\n用户反馈：{json.dumps(feedback, ensure_ascii=False)}"
    text, usage = ai_provider.chat(system, user)
    proposal = _parse_json(text)
    llm_call = {
        "model": settings.ai_model,
        "input_tokens": usage["input_tokens"],
        "output_tokens": usage["output_tokens"],
        "cost": estimate_cost(settings.ai_model, usage["input_tokens"], usage["output_tokens"]),
        "timestamp": _now(),
    }
    iteration = state.get("iteration", 0) + (1 if feedback else 0)
    return {
        "proposal": proposal,
        "iteration": iteration,
        "llm_calls": state.get("llm_calls", []) + [llm_call],
        "status": "awaiting_feedback",
    }


def propose_node(state: ClassifyState) -> dict:
    """AI 提议分类（首轮）."""
    return _classify(state, feedback=None)


def refine_node(state: ClassifyState) -> dict:
    """带用户反馈重新分类."""
    return _classify(state, feedback={
        "text": state.get("feedback_text"),
        "drag": state.get("feedback_drag"),
    })


def await_feedback_node(state: ClassifyState) -> dict:
    """interrupt 等用户反馈（拖拽 + 对话文本）."""
    feedback = interrupt({
        "proposal": state.get("proposal"),
        "iteration": state.get("iteration"),
    })
    return {
        "feedback_text": feedback.get("feedback_text"),
        "feedback_drag": feedback.get("feedback_drag"),
        "status": "refining",
    }


def finalize_node(state: ClassifyState) -> dict:
    """生成建歌单计划（不调 QQ API）."""
    proposal = state.get("proposal", [])
    plan: dict[str, list[list[int]]] = {}
    for item in proposal:
        cat = item.get("category", "其他")
        plan.setdefault(cat, []).append([item.get("song_id"), item.get("song_type", 0)])
    return {"status": "finalized", "plan": plan}


def route_after_feedback(state: ClassifyState) -> str:
    """await_feedback 后路由：用户确认或超轮次 → finalize，否则 → refine."""
    if state.get("status") == "finalized":
        return "finalize"
    if state.get("iteration", 0) >= settings.classify_max_iterations:
        return "finalize"
    return "refine"
