# 贡献指南

TuneSet：把 QQ 音乐"我喜欢"/他人歌单的歌曲，用 AI 分类成多个新歌单，保证版本一致性。

## 开发环境前置

- Docker + Docker Compose（推荐，一键起全套）
- 或本地：Python 3.12+、Node 18+、Redis（redis-stack 兼容，需 RedisJSON+RediSearch）

## 快速启动（Docker）

```bash
cp .env.example .env   # 按需修改 SECRET_KEY / AI_API_KEY / SUPERADMIN_PASSWORD
docker compose up -d --build
```

服务端口：

- 前端：http://localhost（`FRONTEND_PORT` 可改）
- 后端：http://localhost:8000
- Redis：localhost:6381

## 本地开发

### 后端

```bash
cd backend
uv sync                                         # 安装依赖（含 dev: ruff/pytest）
uv run uvicorn app.main:app --reload            # 热重载开发
```

### 前端

```bash
cd frontend
npm install
npm run dev                                     # vite dev server
```

## 脚本参考

<!-- AUTO-GENERATED:scripts -->
| 命令 | 说明 |
|------|------|
| **后端** | |
| `uv sync` | 安装依赖（`--no-dev` 跳过 dev 依赖） |
| `uv run uvicorn app.main:app --reload` | 启动开发服务器（热重载） |
| `uv run pytest` | 运行测试（pytest-asyncio, auto 模式） |
| `uv run ruff check .` | lint 检查（line-length=100, py312） |
| `uv run ruff format .` | 自动格式化 |
| `uv run celery -A app.tasks.celery_app worker -l info` | 启动 Celery worker |
| **前端** | |
| `npm run dev` | vite 开发服务器 |
| `npm run build` | tsc 类型检查 + 生产构建 |
| `npm run typecheck` | 仅类型检查（不产 dist） |
| `npm run lint` | oxlint 检查 |
| `npm run preview` | 预览生产构建 |
| **Docker** | |
| `docker compose up -d --build` | 构建并启动全部服务 |
| `docker compose up -d --build backend` | 仅重建后端（代码无挂载卷，变更必须 rebuild） |
| `docker compose logs -f backend` | 查看后端日志 |
| `docker compose down` | 停止全部服务 |
<!-- /AUTO-GENERATED:scripts -->

## 环境变量

真相源：`backend/.env.example`（每个变量均有中文注释）。下表为概览，默认值以 `.env.example` 为准。

<!-- AUTO-GENERATED:env -->
| 变量 | 必需 | 说明 |
|------|------|------|
| `APP_ENV` | 否 | 运行环境：development / production |
| `SECRET_KEY` | 是 | JWT/会话签名密钥，生产必须改为长随机串 |
| `SQLITE_PATH` | 否 | SQLite 数据库文件路径 |
| `REDIS_URL` | 是 | Redis 连接（Celery + LangGraph checkpoint + 限流共用） |
| `JWT_ALGORITHM` | 否 | JWT 签名算法 |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | 否 | access token 有效期（分钟） |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | 否 | refresh token 有效期（天） |
| `PUBLIC_REGISTRATION_ENABLED` | 否 | 是否开放公开注册 |
| `INVITE_CODE_REQUIRED` | 否 | 注册是否必须邀请码 |
| `SUPERADMIN_EMAIL` | 是 | 超管邮箱（启动时创建；已存在则跳过） |
| `SUPERADMIN_PASSWORD` | 是 | 超管密码（改后重启后端生效） |
| `FRONTEND_PORT` | 否 | compose 宿主映射端口（容器内 nginx 固定 80） |
| `RATE_LIMIT_USER_DAILY` | 否 | 用户每日 AI 调用上限 |
| `RATE_LIMIT_IP_HOURLY` | 否 | IP 每小时请求上限 |
| `RATE_LIMIT_CLASSIFY_INTERVAL` | 否 | 分类任务最小间隔（秒） |
| `CLASSIFY_MAX_SONGS` | 否 | 单次分类最大歌曲数 |
| `CLASSIFY_MAX_ITERATIONS` | 否 | 分类最大轮次（多轮 HITL，最多 5） |
| `AI_PROTOCOL` | 是 | AI 协议：openai / anthropic |
| `AI_BASE_URL` | 是 | AI API 基址 |
| `AI_API_KEY` | 是 | AI API 密钥 |
| `AI_MODEL` | 否 | AI 模型名 |
| `CELERY_BROKER_URL` | 是 | Celery broker（任务队列） |
| `CELERY_RESULT_BACKEND` | 是 | Celery result backend（结果存储） |
| `LANGSMITH_TRACING` | 否 | 是否启用 LangSmith 追踪 |
| `LANGSMITH_API_KEY` | 否 | LangSmith API 密钥 |
<!-- /AUTO-GENERATED:env -->

## API 端点参考

真相源：`backend/app/api/*.py` 路由定义。所有端点前缀 `/api`。

<!-- AUTO-GENERATED:api -->
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/auth/register` | 注册（邀请码/公开） |
| POST | `/api/auth/login` | 邮箱密码登录 |
| POST | `/api/auth/refresh` | 刷新 access token |
| GET | `/api/auth/me` | 当前用户信息 |
| POST | `/api/qq/qrcode` | 获取 QQ 登录二维码 |
| POST | `/api/qq/check` | 检查扫码状态 |
| GET | `/api/qq/status` | 查询 QQ 绑定状态（方案⑤调整） |
| POST | `/api/qq/unbind` | 解绑 QQ 登录态（清服务端 credential） |
| POST | `/api/songlist/favorite` | 取"我喜欢"歌曲（dirid=201，euin 取自 credential） |
| POST | `/api/songlist/shared` | 取分享歌单歌曲（无需登录态） |
| POST | `/api/classify/start` | 启动分类任务 |
| GET | `/api/classify/{thread_id}` | 查询分类状态 |
| POST | `/api/classify/{thread_id}/feedback` | 提交反馈（拖拽 + 对话） |
| POST | `/api/classify/{thread_id}/confirm` | 确认建歌单 |
| POST | `/api/classify/{thread_id}/cancel` | 取消分类任务 |
<!-- /AUTO-GENERATED:api -->

## 测试

```bash
cd backend && uv run pytest        # 后端测试
cd frontend && npm run typecheck   # 前端类型检查
```

后端测试位于 `backend/tests/`，使用 pytest-asyncio（`asyncio_mode = auto`）。新增异步测试无需手动标记。

## 代码风格

- 后端：ruff（line-length=100，target py312）。提交前 `uv run ruff check . && uv run ruff format .`
- 前端：oxlint + tsc。提交前 `npm run lint && npm run build`
- 遵循现有代码风格，surgical 改动，不重构无关代码

## 提交规范

Conventional Commits 风格，中文描述：

```
feat(songlist): 接入"我喜欢"入口
fix(backend): 改密后重启更新哈希
refactor(frontend): 阶段6 api.ts 响应类型化
docs: .env.example 加中文注释
```

- `docs/superpowers/` 本项目入库（设计 spec；例外于全局 CLAUDE.md 第 5 条，其他项目默认仍过滤）
- 阶段任务 review 通过后提交
