# TuneSet

> 把 QQ 音乐"我喜欢"/他人歌单的歌曲,用 AI 分类成多个新歌单,保证版本一致性。

TuneSet 通过 QQ音乐 API 精确按 `song_id` 添加歌曲,绕开 QQ音乐按歌名模糊匹配导致的版本错配;并以 LangGraph 编排多轮人机协同(HITL)工作流,让 AI 在用户拖拽 + 对话反馈下迭代优化分类结果。

## 功能特性

- **双入口**:扫码登录取"我喜欢"歌单 / 粘贴分享链接取任意他人歌单
- **AI 分类**:依据歌名 + 歌手 + `get_labels` 标签,缺标签补 `get_lyric` 歌词
- **多轮 HITL(模式 C)**:AI 提议 → 用户拖拽(dnd-kit)+ 对话反馈 → AI 带上下文重分类,**最多 5 轮** → 确认落库
- **版本一致性**:用 `SonglistApi.add_songs(dirid, [(song_id, song_type), ...])` 按 `song_id` 精确添加
- **QQ 登录态服务端持久化**:credential 加密存于 SQLite(Fernet),`refresh_token` 自动刷新 musickey,跨会话/跨设备共享,避免频繁扫码触发 20279 设备超限
- **SSE 推送**:"我喜欢"列表变化实时推送到前端
- **用户系统**:邀请码注册 + 可配公开注册开关;邮箱密码登录 + JWT 鉴权
- **强限流**:用户级日上限 + IP 小时上限 + 单次/轮次/间隔上限(AI 成本由开发者承担,共用配额)

## 技术栈

| 层 | 选型 |
|---|---|
| 后端 | Python 3.12 · FastAPI · uvicorn · SQLAlchemy · SQLite · pydantic-settings |
| 任务队列 | Celery · Redis(redis-stack,含 RedisJSON + RediSearch) |
| AI 编排 | LangGraph · `anthropic` + `openai` 双 SDK |
| 认证 | JWT(python-jose) · bcrypt · email-validator |
| QQ音乐 | [qqmusic-api-python](https://github.com/L-1124/QQMusicApi) `==0.6.8` |
| 日志 | loguru(JSON 结构化 + 文件 rotation,`enqueue=True` 多进程安全) |
| 前端 | React 19 · TypeScript · Vite 8 · dnd-kit · axios · react-router-dom 7 |
| 部署 | Docker Compose |

## 架构

```
┌────────────┐      ┌────────────────────────────────────────────────┐
│  Browser   │─────▶│  nginx(frontend 容器)                          │
│  React SPA │      │  ─ 静态托管 SPA                                 │
│  dnd-kit   │◀─SSE─│  ─ /api 反代 backend:8000                       │
└────────────┘      └───────────────────────┬────────────────────────┘
                                            │
              ┌─────────────────────────────▼─────────────────────────────┐
              │  backend(FastAPI + uvicorn)                                │
              │  ─ 路由:auth / qq / songlist / classify / stream / health │
              │  ─ ratelimit 中间件                                        │
              │  ─ LangGraph 分类工作流(state + checkpoint)               │
              └───┬───────────────┬───────────────┬──────────────────────┘
                  │               │               │
         ┌────────▼──────┐  ┌─────▼──────┐  ┌─────▼──────────────┐
         │  Redis        │  │  SQLite    │  │  Celery            │
         │  ─ broker     │  │  ─ users   │  │  worker / beat     │
         │  ─ checkpoint │  │  ─ invite  │  │  ─ classify_task   │
         │  ─ 限流计数   │  │  ─ audit   │  │  ─ fav_cache        │
         │               │  │  ─ qq_cred │  └────────────────────┘
         └───────────────┘  └────────────┘
```

- **LangGraph checkpoint** 复用 Redis,按 `thread_id` 跨 HTTP 请求维持分类状态
- **Celery task** 内用 `asyncio.run` 包异步调用(因 qqmusic-api 全异步)
- **SSE 推送** 按 euin 临时缓存(Redis,TTL = 推送间隔 × 2,连接断开清理)
- **QQ 登录态** 独立于账号 JWT,服务端加密持久化,解绑走 `/api/qq/unbind`

## 快速开始

### Docker(推荐)

```bash
git clone git@github.com:mi4646/tuneset.git
cd tuneset
cp .env.example .env   # 至少改 SECRET_KEY / AI_API_KEY / SUPERADMIN_PASSWORD
docker compose up -d --build
```

服务端口:

| 服务 | 地址 |
|---|---|
| 前端 | http://localhost(端口随 `FRONTEND_PORT` 变) |
| 后端 | http://localhost:8000 |
| Redis | localhost:6381 |

> `docker compose up -d` 时,frontend 容器会等 backend healthcheck 通过(`condition: service_healthy`)才启动,避免 nginx 抢跑导致 502。

### 本地开发

详见 [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)。简要:

```bash
# 后端(需本机 Redis,redis-stack 兼容)
cd backend && uv sync && uv run uvicorn app.main:app --reload

# 前端
cd frontend && npm install && npm run dev
```

## 项目结构

```
tuneset/
├── backend/                      # FastAPI 后端
│   ├── app/
│   │   ├── api/                  # 路由:auth / qq / songlist / classify / stream / health
│   │   ├── ai/                   # AI provider + prompts + pricing
│   │   ├── auth/                 # JWT 签发 + 依赖注入
│   │   ├── db/                   # SQLAlchemy 基类 + 初始化
│   │   ├── models/               # ORM:user / invite_code / audit
│   │   ├── ratelimit/            # 限流中间件
│   │   ├── tasks/                # Celery:celery_app / classify_task / fav_cache
│   │   ├── workflow/             # LangGraph:nodes / state / graph
│   │   └── (config / logging / redis_client / qqmusic / schemas / security / services)
│   ├── tests/                    # pytest-asyncio
│   ├── Dockerfile
│   └── pyproject.toml
├── frontend/                     # React SPA
│   ├── src/
│   │   ├── pages/                # Login / Register / QrLogin / SonglistInput / ClassifyWorkbench
│   │   ├── components/  hooks/  api.ts  types.ts
│   ├── nginx.conf                # SPA 托管 + /api 反代
│   └── package.json
├── docs/                         # 文档(见下)
├── docker-compose.yml            # redis / backend / worker / beat / frontend
└── CLAUDE.md                     # 项目约束 + 日志规范
```

## 文档

| 文档 | 内容 |
|---|---|
| [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) | 贡献指南:本地开发、脚本参考、环境变量、API 端点、测试、代码风格、提交规范 |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | 运维手册:部署流程、健康检查、常见问题、回滚 |
| [`docs/plan.md`](docs/plan.md) | 完整方案决策 |
| [`docs/qqmusic-api-interfaces.md`](docs/qqmusic-api-interfaces.md) | QQMusicApi 命门接口确认 |
| [`CHANGELOG.md`](CHANGELOG.md) | 变更记录(每版本更新摘要) |
| [`CLAUDE.md`](CLAUDE.md) | 项目约束 + 日志规范(给 AI 助手) |

## 配置

环境变量真相源:[`.env.example`](.env.example)(每项均有中文注释)。关键项:

| 变量 | 必需 | 说明 |
|---|:---:|---|
| `SECRET_KEY` | 是 | JWT/会话签名密钥,生产必须改为长随机串 |
| `AI_API_KEY` | 是 | AI 服务密钥 |
| `SUPERADMIN_PASSWORD` | 是 | 超管初始密码(启动时创建,改后重启生效) |
| `AI_PROTOCOL` | 是 | `openai` / `anthropic` |
| `AI_BASE_URL` | 是 | AI API 基址 |
| `REDIS_URL` | 是 | Redis 连接(Celery + LangGraph checkpoint + 限流共用) |
| `CELERY_BROKER_URL` | 是 | Celery broker |
| `CELERY_RESULT_BACKEND` | 是 | Celery result backend |
| `PUBLIC_REGISTRATION_ENABLED` | 否 | 是否开放公开注册(默认 `false`,仅邀请码) |
| `INVITE_CODE_REQUIRED` | 否 | 注册是否必须邀请码(默认 `true`) |

完整变量表见 [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)。

## 测试

```bash
cd backend && uv run pytest        # 后端(pytest-asyncio,auto 模式)
cd frontend && npm run typecheck   # 前端类型检查
cd frontend && npm run lint        # 前端 oxlint
```

## 提交规范

Conventional Commits 风格,中文描述:

```
feat(songlist): 接入"我喜欢"入口
fix(backend): 改密后重启更新哈希
refactor(frontend): 阶段6 api.ts 响应类型化
docs: .env.example 加中文注释
```

详见 [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)。

## License

本项目暂未指定开源 License。如需使用,请联系仓库所有者。
