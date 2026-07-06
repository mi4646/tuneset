"""分类工作流节点.

流程：split → batch_propose(×N) → merge → await_feedback(interrupt) → [refine → await_feedback]* → finalize
最多 classify_max_iterations 轮 refine，超轮或用户确认 → finalize。
finalize 不调 QQ API，只生成建歌单计划；confirm 端点才调 QQ API（QQ 登录态不入 state）。
"""

import json
from datetime import datetime, timezone

from langgraph.types import interrupt

from app.ai.pricing import estimate_cost
from app.ai.prompts import build_classify_prompt, build_merge_prompt, build_refine_prompt
from app.ai.provider import ai_provider
from app.config import settings
from app.logging import get_logger
from app.redis_client import redis_client
from app.workflow.state import ClassifyState, LLMCall, ProposalItem, SongItem

log = get_logger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_json(text: str) -> list:
    """从 AI 返回解析 JSON 数组（容错：去 markdown fence）."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    return json.loads(text)


def _classify_batch(batch: list[SongItem], state: ClassifyState) -> tuple[list[ProposalItem], LLMCall]:
    """单批分类：调 AI + 解析 + 估算成本."""
    songs_json = json.dumps(batch, ensure_ascii=False)
    system, user = build_classify_prompt(songs_json)
    text, usage = ai_provider.chat(system, user)
    proposal = _parse_json(text)
    llm_call: LLMCall = {
        "model": settings.ai_model,
        "input_tokens": usage["input_tokens"],
        "output_tokens": usage["output_tokens"],
        "cost": estimate_cost(settings.ai_model, usage["input_tokens"], usage["output_tokens"]),
        "timestamp": _now(),
    }
    return proposal, llm_call


def _merge_proposals(batch_proposals: list[list[ProposalItem]], state: ClassifyState) -> tuple[list[ProposalItem], LLMCall]:
    """归一化分批提案：调 AI 合并同义类名."""
    batch_proposals_json = json.dumps(batch_proposals, ensure_ascii=False)
    system, user = build_merge_prompt(batch_proposals_json)
    text, usage = ai_provider.chat(system, user)
    proposal = _parse_json(text)
    llm_call: LLMCall = {
        "model": settings.ai_model,
        "input_tokens": usage["input_tokens"],
        "output_tokens": usage["output_tokens"],
        "cost": estimate_cost(settings.ai_model, usage["input_tokens"], usage["output_tokens"]),
        "timestamp": _now(),
    }
    return proposal, llm_call


def _classify_refine(state: ClassifyState) -> dict:
    """带用户反馈 + 当前合并提案重新分类（全量重跑）."""
    songs = state.get("songs", [])
    songs_json = json.dumps(songs, ensure_ascii=False)
    feedback = {
        "text": state.get("feedback_text"),
        "drag": state.get("feedback_drag"),
    }
    current_proposal = state.get("proposal", [])
    current_proposal_json = json.dumps(current_proposal, ensure_ascii=False)
    system, user = build_refine_prompt(songs_json, feedback, current_proposal_json)
    text, usage = ai_provider.chat(system, user)
    proposal = _parse_json(text)
    llm_call: LLMCall = {
        "model": settings.ai_model,
        "input_tokens": usage["input_tokens"],
        "output_tokens": usage["output_tokens"],
        "cost": estimate_cost(settings.ai_model, usage["input_tokens"], usage["output_tokens"]),
        "timestamp": _now(),
    }
    iteration = state.get("iteration", 0) + 1
    return {
        "proposal": proposal,
        "iteration": iteration,
        "llm_calls": state.get("llm_calls", []) + [llm_call],
        "status": "awaiting_feedback",
    }


def split_node(state: ClassifyState) -> dict:
    """按 classify_batch_size 切批."""
    songs = state.get("songs", [])
    batch_size = settings.classify_batch_size
    batches = [songs[i:i + batch_size] for i in range(0, len(songs), batch_size)]
    return {
        "batches": batches,
        "batch_index": 0,
        "total_batches": len(batches),
        "completed_batches": 0,
        "batch_proposals": [],
    }


def batch_propose_node(state: ClassifyState) -> dict:
    """单批 AI 分类（重试 3 次），追加到 batch_proposals."""
    batch = state["batches"][state["batch_index"]]
    for attempt in range(3):
        try:
            proposal, call = _classify_batch(batch, state)
            break
        except Exception as e:
            log.warning("batch_propose_failed", batch_index=state["batch_index"], attempt=attempt, error=str(e))
            if attempt == 2:
                raise
    new_completed = state["completed_batches"] + 1
    new_batch_index = state["batch_index"] + 1
    redis_client.publish(
        f"classify:progress:{state['thread_id']}",
        json.dumps({"completed": new_completed, "total": state["total_batches"], "status": "running"}),
    )
    result: dict = {
        "batch_proposals": state["batch_proposals"] + [proposal],
        "completed_batches": new_completed,
        "batch_index": new_batch_index,
        "llm_calls": state.get("llm_calls", []) + [call],
    }
    # 单批时直接写 proposal（跳过 merge 省 AI 调用）
    if state.get("total_batches", 0) == 1:
        result["proposal"] = proposal
        result["status"] = "awaiting_feedback"
        result["iteration"] = 0
    return result


def merge_node(state: ClassifyState) -> dict:
    """归一化分批提案为统一 proposal."""
    proposal, call = _merge_proposals(state["batch_proposals"], state)
    redis_client.publish(
        f"classify:progress:{state['thread_id']}",
        json.dumps({"status": "awaiting_feedback", "proposal": proposal, "iteration": 0}),
    )
    return {
        "proposal": proposal,
        "llm_calls": state.get("llm_calls", []) + [call],
        "status": "awaiting_feedback",
        "iteration": 0,
    }


def refine_node(state: ClassifyState) -> dict:
    """带用户反馈重新分类."""
    return _classify_refine(state)


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


def route_after_batch(state: ClassifyState) -> str:
    """batch_propose 后路由：还有批 → batch_propose；多批完成 → merge；单批完成 → await_feedback."""
    if state.get("batch_index", 0) < state.get("total_batches", 0):
        return "batch_propose"
    if state.get("total_batches", 0) > 1:
        return "merge"
    return "await_feedback"


def route_after_feedback(state: ClassifyState) -> str:
    """await_feedback 后路由：用户确认或超轮次 → finalize，否则 → refine."""
    if state.get("status") == "finalized":
        return "finalize"
    if state.get("iteration", 0) >= settings.classify_max_iterations:
        return "finalize"
    return "refine"
