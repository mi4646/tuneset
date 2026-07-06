# 分批分类设计（Batch Classify Design）

> 状态：已定稿，待实现
> 关联：`2fbe8ec` 把歌曲拉取改为全量后，分类入口的 200 上限与之割裂，本设计消除该割裂。

## 1. 背景与目标

**背景**：`2fbe8ec` 把歌曲拉取改为全量后，"我喜欢"/分享歌单可返回 >200 首。但分类入口 `/api/classify/start` 仍受 `classify_max_songs=200` 拦截（`backend/app/api/classify.py:41-42`），用户拉到全量歌曲后无法分类，页面报 `max 200 songs`。

**目标**：支持对全量歌曲（上限 `classify_max_songs=2000`）进行 AI 分类，按批喂给 LLM 控制单次上下文与成本，最终合并为统一提案交付 HITL。

**非目标**：
- 不做断点续跑（列入后续优化）
- 不做预聚类分批（顺序切即可）
- 不改 confirm 端点（按 song_id 精确添加，天然跨批兼容）

## 2. 现状与问题

### 2.1 现有架构

| 组件 | 位置 | 现状 |
|---|---|---|
| 分类入口 | `backend/app/api/classify.py:33-60` | 同步 `.get(timeout=120)`，超 200 首拒绝 |
| State | `backend/app/workflow/state.py:43-60` | 单线程扁平 `proposal: list[ProposalItem]` |
| 节点流程 | `backend/app/workflow/graph.py:20-34` | `propose → await_feedback(interrupt) → [refine → await_feedback]* → finalize` |
| Prompt | `backend/app/ai/prompts.py` | 全量 songs 一次塞 system+user |
| 限流 | `backend/app/config.py:50-55` | `classify_max_songs=200`（入口护栏 + 事实批大小）|
| SSE | `backend/app/api/stream.py` | 仅"我喜欢"推送，按 euin + Redis pub/sub |

### 2.2 问题清单

1. **入口截断**：200 首上限与全量拉取割裂
2. **同步超时**：500 首分批跑 5–10 分钟，`.get(timeout=120)` 必超时，HTTP 也会被 nginx/浏览器掐断
3. **Prompt 爆炸**：全量 songs JSON 塞一次 AI，超上下文窗口
4. **无合并机制**：跨批分类名漂移（"摇滚"/"Rock"）无法归一
5. **HITL 模型不适用**：现单线程 interrupt，分批后若每批各自 HITL，用户要操作 N×5 轮

## 3. 设计总览

```
用户点"开始分类"（songs > batch_size）
  │
  ▼
POST /classify/start  ──→ 立即返回 thread_id（异步）
  │
  ▼
Celery 后台跑：
  ┌─────────────────────────────────────────────────┐
  │  split_node  ──→ 切批                             │
  │       │                                          │
  │       ▼                                          │
  │  batch_propose(batch_1) ──┐                      │
  │  batch_propose(batch_2) ──┤  各批独立分类          │
  │  batch_propose(batch_N) ──┘  (串行，每批重试 3 次)  │
  │           │                                      │
  │           ▼                                      │
  │      merge_node  ← 归一化同义类名、跨批同类合并     │
  │           │                                      │
  │           ▼                                      │
  │   await_feedback(interrupt)  ← 统一一轮 HITL     │
  │           │                                      │
  │           ▼                                      │
  │   [refine → await_feedback]*  最多 5 轮          │
  │           │                                      │
  │           ▼                                      │
  │      finalize_node  ← 生成 plan                  │
  └─────────────────────────────────────────────────┘
  │
  ▼
SSE 推送批次进度 → 前端展示"2/3 批完成"
  │
  ▼
HITL：用户拖拽+文本反馈 → refine → … → confirm
```

## 4. 核心决策

| # | 抉择 | 决策 | 理由 |
|---|---|---|---|
| 1 | 分批边界 | 顺序切，每 `classify_batch_size=200` 首一批 | 预聚类多一次 AI 调用，顺序切可预测；类名漂移靠 merge 解决 |
| 2 | 合并策略 | 各批独立分类 + `merge` 节点归一（多一次 AI） | 增量沿用 schema 会让首批偏差传染全量；独立+merge 职责清晰 |
| 3 | HITL 模型 | 全部批跑完 + merge → 统一一轮 HITL → refine 全量重分类 → … → finalize，最多 5 轮 | 用户心智是"一堆歌帮我分"；每批 HITL 操作量不可接受 |
| 4 | 执行模型 | start 异步，立即返回 thread_id；SSE 推批次进度 | 同步 HTTP 必超时；复用 Redis pub/sub 基础设施 |
| 5 | 限流 | `classify_max_songs=2000`（总上限）+ `classify_batch_size=200`（单批）+ `rate_limit_user_daily=10` | 分批后单次成本翻 N 倍，日限必须收紧 |
| 6 | 失败恢复 | 单批重试 3 次，仍失败则整任务失败 | 部分缺失致合并残缺，用户难补救 |

## 5. 详细设计

### 5.1 State 扩展

`backend/app/workflow/state.py` 的 `ClassifyState` 新增字段：

```python
class ClassifyState(TypedDict, total=False):
    # 输入
    songs: list[SongItem]
    user_id: int
    thread_id: str
    # 分批
    batches: list[list[SongItem]]              # 切批后的歌曲子集
    batch_index: int                            # 当前跑的批索引
    batch_proposals: list[list[ProposalItem]]   # 各批独立提案
    # AI 输出
    proposal: list[ProposalItem]                # 合并后提案（merge_node 写入，HITL/refine 用）
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
    plan: dict
    # 进度（SSE 用）
    total_batches: int
    completed_batches: int
```

单 `thread_id`，不搞父子 thread（LangGraph checkpoint 按 thread_id 恢复，单 thread 状态完整）。

### 5.2 节点流程

新 graph（`backend/app/workflow/graph.py`）：

```
START → split → batch_propose → (batch_index < total ? batch_propose : merge)
                          ↑                │
                          └─ next batch ───┘
                                           ▼
                                   await_feedback(interrupt)
                                           │
                                   [refine → await_feedback]*  (route_after_feedback)
                                           │
                                           ▼
                                       finalize → END
```

新增节点（`backend/app/workflow/nodes.py`）：

- **`split_node`**：按 `classify_batch_size` 切 `songs` → `batches`，初始化 `batch_index=0`、`total_batches=N`、`completed_batches=0`。若 `len(songs) <= classify_batch_size`，走老路径（直接 propose → await_feedback），跳过 split/batch/merge，省一次 merge AI 调用
- **`batch_propose_node`**：取 `batches[batch_index]`，调 AI 分类（重试 3 次）→ 追加到 `batch_proposals`，`completed_batches += 1`，`batch_index += 1`；同时 `redis.publish(f"classify:progress:{thread_id}", ...)` 推进度。条件边：`batch_index < total_batches` → 回 `batch_propose`，否则 → `merge`
- **`merge_node`**：把 `batch_proposals`（N 个列表）喂 AI 做归一化 → 写 `proposal`（合并后统一提案）。Prompt 见 5.3
- **`refine_node`**：改造现有 `_classify`，接收"用户反馈 + 当前合并 proposal + 全量 songs"重分类（抉择 3 选 a 全量重跑）。首版全量重跑，若超上下文再改精准 refine（仅重跑反馈涉及类别对应的批）
- `await_feedback_node` / `finalize_node` / `route_after_feedback`：基本不变

**条件边**：
- `batch_propose` 后：`batch_index < total_batches` → `batch_propose`；否则 → `merge`
- `await_feedback` 后：`route_after_feedback`（超轮或确认 → finalize，否则 → refine）

### 5.3 Prompt 改造

`backend/app/ai/prompts.py` 新增 merge prompt：

```python
MERGE_SYSTEM = """你是一个音乐分类归一化助手。输入是多批歌曲的分类提案，可能存在同义不同名的类别（如"摇滚"/"Rock"/"rock"）。
你的任务：
1. 合并同义类别名为统一名称（优先用中文常用名）
2. 跨批同类歌曲归到同一类别
3. 输出统一的提案列表，每项 {"song_id", "song_type", "category", "reason"}
返回严格的 JSON 数组。"""

MERGE_USER_TEMPLATE = """请归一化以下分批分类提案：

{batch_proposals_json}

返回合并后的 JSON 数组。"""
```

`build_classify_prompt` 保持不变（单批分类仍用现有 prompt，只是 songs 变成单批子集）。

refine prompt 扩展：在现有 user 模板追加"用户反馈"+"当前合并提案"，让 AI 在合并提案基础上调整。

### 5.4 API 变更

#### `POST /classify/start`（`backend/app/api/classify.py:33-60`）

- 入口校验：`len(body.songs) > settings.classify_max_songs`（2000）拒绝
- 不再 `.get(timeout=120)` 同步等，改为 `classify_task.delay(...)` 后立即返回：

```python
thread_id = str(uuid.uuid4())
classify_task.delay(songs, user.id, thread_id)
log_audit(..., status="running")
return StartResponse(thread_id=thread_id, status="running", proposal=[], iteration=0)
```

- 前端拿到 thread_id 后订阅 SSE 等进度

#### 新增 `GET /classify/{thread_id}/stream`（SSE 进度）

仿 `backend/app/api/stream.py:66-89`，独立 channel `classify:progress:{thread_id}`：

- Celery task 每跑完一批 → `redis.publish(f"classify:progress:{thread_id}", json.dumps({"completed": i, "total": N, "status": "running"}))`
- merge 完成 → publish `{"status": "awaiting_feedback", "proposal": [...]}`
- SSE 端点订阅该 channel，事件类型 `classify_progress` / `classify_ready` / `classify_failed`
- TTL：thread_id 生命周期内有效，超时清理（初定 30 分钟）

#### `POST /classify/{thread_id}/feedback`、`confirm`、`cancel`

不变。feedback 仍走 `classify_resume_task`，confirm 仍按 plan 建 songlist + `add_songs`（按 song_id 精确添加，跨批天然兼容）。

### 5.5 限流参数

`backend/app/config.py:50-55` 改动：

```python
# 限流
rate_limit_user_daily: int = 10          # 30 → 10（分批成本上调）
rate_limit_ip_hourly: int = 20
rate_limit_classify_interval: int = 30
classify_max_songs: int = 2000           # 200 → 2000（总上限）
classify_batch_size: int = 200           # 新增（单批 AI 上限）
classify_max_iterations: int = 5
```

`.env` / `.env.example` 同步：
- `CLASSIFY_MAX_SONGS=2000`
- 新增 `CLASSIFY_BATCH_SIZE=200`
- `RATE_LIMIT_USER_DAILY=10`

`classify.py:42` 错误消息 `f"max {settings.classify_max_songs} songs"` 已是动态，无需改。

### 5.6 失败恢复

`batch_propose_node` 内单批重试逻辑（伪码）：

```python
for attempt in range(3):
    try:
        proposal = _classify_batch(batch)
        break
    except Exception as e:
        log.warning("batch_propose_failed", batch_index=i, attempt=attempt, error=str(e))
        if attempt == 2:
            raise  # 整任务失败，Celery 标记 FAILURE
```

整任务失败 → SSE 推 `{"status": "failed", "error": "..."}`，前端提示用户重试。不断点续跑（后续优化）。

## 6. 前端交互

- **拉取后**：若 `songs.length > classify_max_songs`（2000），前端拦截提示"超过单次上限，请筛选"
- **点击分类**：`classifyApi.start(songs)` → 拿 `thread_id` → `new EventSource(/classify/{thread_id}/stream)`
- **进度展示**：监听 `classify_progress` 事件，显示"正在分类 2/3 批…"
- **就绪**：监听 `classify_ready` 事件，拿到 `proposal` → 渲染 dnd-kit 拖拽界面（作用于合并后提案）
- **HITL**：拖拽+文本反馈 → `classifyApi.feedback` → 等 SSE 推下一轮 `classify_ready`
- **确认**：`classifyApi.confirm` → 建歌单

`frontend/src/api.ts:114` 的 `classifyApi.start` 返回值从同步 `StartResponse` 改为 `{ thread_id, status: "running" }`，前端调用逻辑要跟着改。

## 7. 配置变更清单

| 文件 | 改动 |
|---|---|
| `backend/app/config.py` | `classify_max_songs` 默认 200→2000；新增 `classify_batch_size=200`；`rate_limit_user_daily` 30→10 |
| `.env` | `CLASSIFY_MAX_SONGS=2000`；新增 `CLASSIFY_BATCH_SIZE=200`；`RATE_LIMIT_USER_DAILY=10` |
| `.env.example` | 同 `.env` |
| `backend/app/workflow/state.py` | 新增 `batches`/`batch_index`/`batch_proposals`/`total_batches`/`completed_batches` 字段 |
| `backend/app/workflow/graph.py` | 新增 `split`/`batch_propose`/`merge` 节点 + 条件边 |
| `backend/app/workflow/nodes.py` | 新增 `split_node`/`batch_propose_node`/`merge_node`；改造 `refine_node` |
| `backend/app/ai/prompts.py` | 新增 `MERGE_SYSTEM`/`MERGE_USER_TEMPLATE`/`build_merge_prompt` |
| `backend/app/api/classify.py` | `start` 改异步；新增 `GET /{thread_id}/stream` SSE |
| `backend/app/tasks/classify_task.py` | `classify_task` 改为跑完整流程（split→批→merge→await_feedback）；批间 publish 进度 |
| `frontend/src/api.ts` | `classifyApi.start` 返回值适配异步 |
| `frontend/src/...` | 新增 SSE 订阅 + 进度 UI |

## 8. 兼容性与迁移

- **向下兼容**：`classify_batch_size` 默认 200，单批场景（songs ≤ 200）走老路径（split 检测到无需分批 → 直接 propose → await_feedback），跳过 merge，行为与现状一致
- **checkpoint 迁移**：旧 thread_id 的 state 无新字段，LangGraph 容错（`state.get` 默认值），不破坏
- **审计**：`log_audit` 的 `status` 新增 `running` 中间态

## 9. 后续优化（非本期）

- **断点续跑**：batch_propose 失败时记录已完成批，重试只跑失败批
- **精准 refine**：refine 时只重跑反馈涉及类别对应的批（抉择 3 的 b 方案）
- **分批并行**：多批并发调 AI（现串行），用 `asyncio.gather`，注意 AI 速率限制
- **成本预估**：start 前预估总 token 成本，超阈值提示用户
- **merge 智能跳过**：单批场景已跳过；后续可对"批间类名无重叠"场景也跳过 merge

## 10. 开放问题

- **AI 上下文窗口**：200 首 ×（name+singer+labels+lyric）可能仍超模型窗口。待实现时验证：若超，`classify_batch_size` 调小或 lyric 截断
- **refine 全量重分类的上下文**：5 轮 refine × 全量 songs 可能超窗口。首版接受，超了再改精准 refine
- **SSE channel 清理**：thread_id 完成后何时清 Redis key。初定 30 分钟 TTL
