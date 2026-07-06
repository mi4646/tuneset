# TuneSet 实施规划

> 基于 `docs/plan.md` 的 24 条决策制定。
> 执行方式：**subagent-driven**（每个任务包可独立交付给 subagent）。
> 本文档不 commit（`docs/superpowers/` 为本地设计规格）。

## 概述

TuneSet = QQ音乐歌曲 → AI 多轮分类 → 精确版本落库。FastAPI + React + LangGraph + Celery/Redis + SQLite。详见 `docs/plan.md`。

## 目录结构

```
tuneset/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py              # pydantic-settings，所有限流参数可配
│   │   ├── deps.py                # 依赖注入（当前用户、QQ态等）
│   │   ├── api/
│   │   │   ├── auth.py            # 注册/登录/refresh/me
│   │   │   ├── qq.py              # QQ扫码登录
│   │   │   ├── songlist.py        # 拉歌单（双入口）
│   │   │   ├── classify.py        # 分类工作流端点
│   │   │   └── health.py
│   │   ├── qqmusic/
│   │   │   ├── client.py          # L-1124 Client 封装
│   │   │   └── credential.py      # QQ登录态会话处理
│   │   ├── workflow/
│   │   │   ├── state.py           # ClassifyState TypedDict（扩展版）
│   │   │   ├── nodes.py           # propose/classify/apply_feedback/finalize
│   │   │   ├── graph.py           # graph 组装 + interrupt
│   │   │   └── checkpointer.py    # Redis checkpointer
│   │   ├── ai/
│   │   │   ├── provider.py        # anthropic/openai 分流
│   │   │   ├── prompts.py         # prompt 模板
│   │   │   └── pricing.py         # 各模型价目表（算 cost_usd）
│   │   ├── tasks/
│   │   │   ├── celery_app.py
│   │   │   └── classify_task.py   # asyncio.run 包异步
│   │   ├── ratelimit/
│   │   │   └── middleware.py      # 用户级/IP级/频率限流
│   │   ├── auth/
│   │   │   ├── jwt.py             # JWT 签发/验证
│   │   │   └── dependencies.py    # JWT 鉴权依赖
│   │   ├── db/
│   │   │   ├── base.py            # SQLAlchemy base
│   │   │   ├── models.py          # User, InviteCode, AuditLog
│   │   │   └── session.py         # SQLite session
│   │   └── schemas/               # Pydantic 请求/响应
│   ├── tests/
│   ├── pyproject.toml             # uv 管理
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Register.tsx
│   │   │   ├── QrLogin.tsx
│   │   │   ├── SonglistInput.tsx
│   │   │   ├── ClassifyWorkbench.tsx   # dnd-kit + 对话 + 轮次 + 撤销
│   │   │   └── Result.tsx
│   │   ├── components/
│   │   │   ├── SongCard.tsx
│   │   │   ├── CategoryColumn.tsx
│   │   │   └── FeedbackInput.tsx
│   │   ├── api/                   # axios 封装
│   │   └── store/                 # Zustand（QQ登录态存 sessionStorage）
│   ├── package.json
│   └── vite.config.ts
├── deploy/
│   └── docker-compose.yml         # redis + backend + frontend
├── docs/
│   ├── plan.md
│   ├── qqmusic-api-interfaces.md
│   └── superpowers/plans/
│       └── tuneset-implementation.md   # 本文档
├── CLAUDE.md
└── .env.example
```

## 模块职责

| 模块 | 职责 |
|---|---|
| api/ | FastAPI 路由，请求/响应模型转换，鉴权 |
| qqmusic/ | 封装 L-1124 Client，处理 QQ登录态传递 |
| workflow/ | LangGraph state/nodes/graph，分类逻辑编排（finalize 只出建歌单计划，不调 QQ API） |
| ai/ | LLM 调用（双 SDK 分流）、prompt、价目表 |
| tasks/ | Celery 任务，asyncio.run 包异步 |
| ratelimit/ | 限流中间件（用户级/IP级/频率） |
| auth/ | JWT 签发验证、鉴权依赖 |
| db/ | SQLAlchemy 模型（User/InviteCode/AuditLog）、SQLite session |

## LangGraph state（扩展版，对应"可检测/可回退"）

```python
class SongInfo(TypedDict):
    song_id: int
    song_type: int
    mid: str                    # songmid 字符串形式
    name: str
    singer: str
    album: str
    duration: int               # 秒
    release_date: str | None
    labels: list[str]
    lyric: str | None           # 缺标签时才补

class Feedback(TypedDict):
    iteration: int
    drag_changes: dict[int, str]   # song_id -> 新类别
    text_command: str | None       # 对话指令
    timestamp: str

class LLMMetadata(TypedDict):      # 可检测：每次 LLM 调用审计
    iteration: int
    node: str                      # propose/classify/apply_feedback
    provider: str                  # anthropic/openai
    model: str
    prompt_tokens: int
    completion_tokens: int
    latency_ms: int
    cost_usd: float                # 按价目表算
    timestamp: str

class ClassifyState(TypedDict):
    # 输入
    songs: list[SongInfo]
    user_id: int
    thread_id: str
    # 分类结果
    categories: list[str]
    assignment: dict[int, str]     # song_id -> 类别
    # 多轮交互
    feedback_history: list[Feedback]
    iteration: int                 # 0..5
    # 可检测
    llm_calls: list[LLMMetadata]
    total_cost_usd: float
    total_tokens: int
    started_at: str
    updated_at: str
    status: str                    # running/paused/confirmed/cancelled/failed
    error: str | None
    # 可回退
    checkpoint_ids: list[str]      # 每轮 iteration 的 checkpoint id，前端撤销用
```

**注意**：state 里**不放 qq_credential**——QQ登录态只在 `/api/classify/confirm` 请求体里出现，confirm 端点拿"建歌单计划"+ QQ态直接调 QQ音乐 API，登录态不进 graph state / checkpoint / SQLite，严格符合方案⑤。

## 实施阶段

### 阶段 1：项目骨架
**任务**：建 Monorepo 结构；backend pyproject.toml（uv）+ FastAPI main.py + config.py；frontend Vite+React+TS 脚手架；deploy/docker-compose.yml（redis+backend+frontend）；.env.example
**验收**：`docker-compose up` 起来，`/api/health` 返回 200，前端首页可访问。

### 阶段 2：用户系统
**任务**：db/ SQLAlchemy base + User 模型（id/email/password_hash/created_at）+ InviteCode 模型（code/used_by/created_at）；auth/jwt.py（python-jose 签发验证）；auth/dependencies.py（FastAPI 依赖解析 JWT）；api/auth.py（register/login/refresh/me）；密码哈希 passlib[bcrypt]
**验收**：能注册（邀请码）、登录拿 JWT、refresh 续期、me 返回用户；公开注册开关按配置生效。

### 阶段 3：QQ音乐对接层
**任务**：qqmusic/client.py 封装 L-1124 Client（get_qrcode/check_qrcode/get_fav_song/get_songlist_detail/get_labels/get_lyric/create_songlist/add_songs）；qqmusic/credential.py 从请求体解析 QQ登录态构造 Credential；api/qq.py（qrcode/qrcode status）；api/songlist.py（fav/by-share）
**验收**：扫码登录拿 QQ态返回前端；前端带 QQ态调 /fav 拉"我喜欢"；/by-share 拉指定歌单。

### 阶段 4：AI 调用层
**任务**：ai/provider.py 按配置 protocol 分流，统一调用接口；ai/prompts.py（propose/classify/apply_feedback 模板）；ai/pricing.py 各模型价目表算 cost_usd
**验收**：给歌曲信息调 LLM 返回类别/分类；切换 protocol 能用 anthropic 或 openai；cost_usd 算对。

### 阶段 5：限流中间件
**任务**：ratelimit/middleware.py 基于 Redis 的用户级（每天）/IP 级（每小时）/频率级（间隔）限流；单次上限 CLASSIFY_MAX_SONGS 请求校验；配置项开发者可配
**验收**：超限返回 429；配置改阈值生效；计数在 Redis。

### 阶段 6：LangGraph 工作流
**任务**：workflow/state.py（ClassifyState 扩展版）；workflow/nodes.py（propose/classify/apply_feedback/finalize，finalize 只生成建歌单计划不调 QQ API）；workflow/graph.py（StateGraph 组装 + interrupt）；workflow/checkpointer.py（Redis）；任务完成后 llm_calls/feedback_history 落 SQLite AuditLog
**验收**：graph 跑 propose→classify→interrupt；提交反馈后 apply_feedback→interrupt；5 轮上限生效；checkpoint 存 Redis 跨请求恢复；撤销回上一轮。

### 阶段 7：分类 API + Celery
**任务**：tasks/celery_app.py（Redis broker/backend）；tasks/classify_task.py（asyncio.run 包异步 graph）；api/classify.py（start/feedback/confirm/cancel/status，confirm 拿建歌单计划 + QQ态调 QQ API 落库）
**验收**：start→feedback→confirm 全流程跑通；cancel 中断；status 查轮次草案；confirm 后歌单建到 QQ音乐、歌曲按 song_id 添加。

### 阶段 8：前端
**任务**：登录/注册页（邀请码 + 公开注册按配置显示）；QQ扫码页（轮询 status）；歌单输入页（双入口）；分类工作台（dnd-kit 拖拽 + 对话指令输入 + 轮次显示 + 撤销按钮 + 确认按钮）；结果页；store（QQ态 sessionStorage，JWT localStorage）
**验收**：完整流程走通；拖拽顺滑；对话指令提交；撤销回上一轮；5 轮上限提示。

### 阶段 9：测试 + CI
**任务**：tests/ pytest 单元（nodes/provider/jwt/ratelimit）+ 集成（API 端到端 mock L-1124）；.github/workflows/ci.yml（ruff lint + test）
**验收**：CI 绿；核心逻辑有测试覆盖。

### 阶段 10：部署
**任务**：deploy/docker-compose.yml 完善（backend 依赖 redis）；backend Dockerfile（uv 安装）；frontend Dockerfile（build + nginx serve）；部署文档
**验收**：个人服务器 `docker-compose up` 一键起，外部可访问。

## 任务拆分（subagent 可领）

| ID | 阶段 | 任务 | 依赖 | 验收 |
|---|---|---|---|---|
| T1.1 | 1 | Monorepo + backend pyproject + FastAPI main | - | /api/health 200 |
| T1.2 | 1 | frontend Vite+React 脚手架 | - | 首页可访问 |
| T1.3 | 1 | docker-compose（redis+backend+frontend） | T1.1, T1.2 | compose up 三服务起 |
| T2.1 | 2 | db/ SQLAlchemy + User/InviteCode 模型 | T1.1 | 表能建 |
| T2.2 | 2 | auth/ JWT 签发验证 + 依赖 | T2.1 | JWT 能签能验 |
| T2.3 | 2 | api/auth 注册/登录/refresh/me | T2.1, T2.2 | 端点通 |
| T3.1 | 3 | qqmusic/ client 封装 L-1124 | T1.1 | 调通 QQ API |
| T3.2 | 3 | api/qq + api/songlist | T3.1, T2.2 | 扫码+拉歌单通 |
| T4.1 | 4 | ai/ provider/prompts/pricing | T1.1 | LLM 调用通 |
| T5.1 | 5 | ratelimit/ 中间件 | T1.1 | 限流生效 |
| T6.1 | 6 | workflow/ state+nodes+graph+checkpointer | T4.1 | graph 跑通 |
| T6.2 | 6 | AuditLog 落 SQLite | T6.1, T2.1 | 审计数据持久化 |
| T7.1 | 7 | tasks/ Celery + classify_task | T6.1 | 异步任务通 |
| T7.2 | 7 | api/classify 全端点 | T7.1, T6.1 | 全流程通 |
| T8.1 | 8 | 前端登录/注册/扫码 | T2.3, T3.2 | 流程通 |
| T8.2 | 8 | 前端歌单输入 + 分类工作台 | T7.2, T8.1 | 拖拽+对话+撤销通 |
| T9.1 | 9 | pytest 测试 | 全部 | CI 绿 |
| T9.2 | 9 | GitHub Actions CI | T9.1 | CI 跑通 |
| T10.1 | 10 | Dockerfile + compose 完善 | 全部 | 一键部署 |

## 配置项清单（.env）

```dotenv
# 应用
APP_ENV=development
SECRET_KEY=<改>

# 数据库
SQLITE_PATH=./data/tuneset.db

# Redis
REDIS_URL=redis://redis:6379/0

# JWT
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440   # 24h
JWT_REFRESH_TOKEN_EXPIRE_DAYS=30

# 注册
PUBLIC_REGISTRATION_ENABLED=false      # 公开注册开关
INVITE_CODE_REQUIRED=true               # 邀请码是否必需

# 限流（开发者可配）
RATE_LIMIT_USER_DAILY=30                # 每用户每天分类次数
RATE_LIMIT_IP_HOURLY=20                 # 每 IP 每小时（注册/登录）
RATE_LIMIT_CLASSIFY_INTERVAL=30         # 两次分类最小间隔（秒）
CLASSIFY_MAX_SONGS=200                  # 每次分类歌曲上限
CLASSIFY_MAX_ITERATIONS=5               # 每任务最大轮次

# AI（开发者配）
AI_PROTOCOL=openai                      # anthropic | openai
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=<改>
AI_MODEL=gpt-4o-mini
# 或 anthropic:
# AI_PROTOCOL=anthropic
# AI_BASE_URL=https://api.anthropic.com
# AI_API_KEY=<改>
# AI_MODEL=claude-haiku-4-5-20251001

# Celery
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2

# LangSmith（可选追踪）
LANGSMITH_TRACING=false
LANGSMITH_API_KEY=
```

## 风险点

| 风险 | 缓解 |
|---|---|
| L-1124 库接口变更（异步、签名） | 阶段 3 优先跑通，封装层隔离 |
| QQ音乐风控（公开服务多账号同 IP） | 限流 + 请求间隔 + 监控 429 |
| AI 成本失控 | 用户级限流 + 轮次上限 + cost_usd 审计 + 单次歌曲上限 |
| LangGraph checkpoint 膨胀占 Redis | 任务完成清理 checkpoint + 审计落 SQLite |
| Celery + 异步摩擦 | asyncio.run 包装，阶段 7 验证 |
| QQ登录态泄露 | 不进 state/checkpoint/SQLite，仅会话级前端持有 |
| SQLite 并发（公开服务） | 单写者 + WAL 模式；若瓶颈再迁 Postgres |

## 持久化策略

| 数据 | 运行时 | 任务完成后 |
|---|---|---|
| state（分类草案/反馈） | Redis checkpoint | 清理（不落库） |
| llm_calls / total_cost | Redis（state 内） | 落 SQLite AuditLog（供回看/成本分析） |
| feedback_history | Redis（state 内） | 落 SQLite AuditLog |
| 用户账号/邀请码 | SQLite | SQLite |

## 执行说明

进入编码阶段时，按任务拆分表的依赖顺序，使用 **subagent-driven 方式**逐个任务推进。每个任务由 subagent 独立完成，验收标准达成后进入下一个。遇到 L-1124 库实际接口与 `docs/qqmusic-api-interfaces.md` 不符时，以实际为准并回更该文档。
