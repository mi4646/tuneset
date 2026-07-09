"""听歌画像 Celery 任务：拉歌 → AI 分析 → 存 Redis + pub/sub 进度."""

import json
import uuid
from datetime import datetime, timezone

from app.ai.provider import ai_provider
from app.config import settings
from app.db.base import SessionLocal
from app.logging import get_logger
from app.qqmusic.credential_store import get_valid_credential
from app.qqmusic.fav import fetch_fav_songs
from app.redis_client import redis_client
from app.tasks.celery_app import celery

log = get_logger(__name__)

PROFILE_SYSTEM = """你是一个听歌分析助手。根据用户收藏的歌曲列表及其标签，分析用户的听歌习惯，返回结构化 JSON。

输出严格的 JSON（无 markdown 包裹）：
{
  "personality": "一段 2-3 句的中文听歌人格描述，有洞察力和创意",
  "radar": [{"axis": "维度名（如 怀旧感）", "value": 0-100 的数值}],
  "clusters": [{"name": "簇名", "insight": "为什么这些歌在一起", "song_indices": [0, 1, 2]}],
  "tags": [{"tag": "标签名", "weight": 1-100 的权重值}]
}

说明：
- radar 包含 6-7 个维度，如：华语浓度、怀旧感、节奏感、情感深度、实验性、年代跨度
- clusters 包含 2-4 个簇，每个簇的 song_indices 引用输入歌曲的数组下标（从 0 开始）
- tags 包含 30-50 个标签（从歌曲标签中精选 + 自行补充），weight 表示该标签的强度
- personality 用中文，口语化、有温度
"""


@celery.task(name="profile_generate")
def profile_generate_task(user_id: int, thread_id: str) -> dict:
    """生成听歌画像。

    1. 取用户收藏歌曲
    2. 获取标签
    3. AI 分析人格、雷达、风格簇、标签云
    4. 统计歌手频率
    5. 存 Redis + pub 完成事件
    """
    try:
        _publish(thread_id, "fetch_labels", "拉取歌曲中...")

        # 1. 取歌
        from sqlalchemy import select
        from app.models import User

        with SessionLocal() as db:
            user = db.scalar(select(User).where(User.id == user_id))
            if not user:
                raise ValueError("user not found")
            import asyncio

            cred = asyncio.run(get_valid_credential(db, user.id))

        songs_raw, total = asyncio.run(fetch_fav_songs(cred))
        if total < 10:
            _publish(thread_id, "done", "歌曲太少")
            result = {
                "error": "songs_too_few",
                "total": total,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }
            redis_client.setex(f"profile:result:{thread_id}", 3600, json.dumps(result))
            return result

        # 限制最大处理量
        songs = songs_raw[:settings.classify_max_songs]

        _publish(thread_id, "fetch_labels", f"拉取标签 {min(500, len(songs))}/{len(songs)}...")

        # 2. 组合歌曲信息
        song_infos = []
        for s in songs:
            labels = s.get("labels") or s.get("tag", [])
            if isinstance(labels, str):
                labels = [labels]
            song_infos.append({
                "name": s.get("name", ""),
                "singer": s.get("singer", ""),
                "labels": labels,
            })

        _publish(thread_id, "aggregating", "聚合数据...")

        # 3. 统计歌手
        artist_counts: dict[str, int] = {}
        for s in songs:
            singer = s.get("singer", "")
            if isinstance(singer, list):
                singer = " / ".join(x.get("name", "") for x in singer)
            if singer:
                artist_counts[singer] = artist_counts.get(singer, 0) + 1
        top_artists = sorted(artist_counts.items(), key=lambda x: -x[1])[:20]

        _publish(thread_id, "ai_personality", "AI 分析听歌人格...")

        # 4. AI 分析
        songs_json = json.dumps(song_infos, ensure_ascii=False)
        try:
            text, _usage = ai_provider.chat(
                PROFILE_SYSTEM,
                f"分析以下歌曲收藏：\n{songs_json}",
                max_tokens=4000,
                temperature=0.7,
            )
            # 解析 JSON
            analysis = json.loads(text)
        except Exception as e:
            log.warning("profile_ai_failed", error=str(e))
            _publish(thread_id, "done", "AI 分析失败")
            result = {
                "error": "ai_failed",
                "personality": "你的听歌风格多样丰富。",
                "radar": [{"axis": "多样性", "value": 80}],
                "clusters": [],
                "artists": [{"artist": a, "count": c} for a, c in top_artists],
                "tags": [],
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }
            redis_client.setex(f"profile:result:{thread_id}", 3600, json.dumps(result))
            return result

        # 5. 组装 ProfileResult
        clusters = []
        for c in analysis.get("clusters", []):
            indices = c.get("song_indices", [])
            cluster_songs = [
                {"song_id": songs[i].get("song_id", 0), "name": songs[i].get("name", ""), "singer": str(songs[i].get("singer", ""))}
                for i in indices if i < len(songs)
            ]
            clusters.append({
                "name": c.get("name", "未命名"),
                "insight": c.get("insight", ""),
                "song_count": len(indices),
                "songs": cluster_songs,
            })

        result = {
            "radar": analysis.get("radar", []),
            "personality": analysis.get("personality", ""),
            "clusters": clusters,
            "artists": [{"artist": a, "count": c} for a, c in top_artists],
            "tags": analysis.get("tags", []),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

        redis_client.setex(f"profile:result:{thread_id}", 3600, json.dumps(result))
        _publish(thread_id, "done", "已完成")
        return result

    except Exception as e:
        log.error("profile_generate_failed", error=str(e))
        _publish(thread_id, "done", "生成失败")
        result = {"error": str(e), "generated_at": datetime.now(timezone.utc).isoformat()}
        redis_client.setex(f"profile:result:{thread_id}", 3600, json.dumps(result))
        raise


def _publish(thread_id: str, stage: str, detail: str) -> None:
    """发布进度事件到 Redis pub/sub."""
    data = json.dumps({"stage": stage, "detail": detail}, ensure_ascii=False)
    redis_client.publish(f"profile:progress:{thread_id}", data)
