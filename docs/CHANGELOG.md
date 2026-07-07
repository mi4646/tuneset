# 变更记录

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.6.1] - 2026-07-07

### Fixed
- Dialog 切屏遮罩残留:`ClassifyWorkbench` 分类失败对话框关闭时,Radix `Presence` 依赖 `animationend` 卸载 overlay DOM;切屏期间 CSS keyframe 动画被浏览器节流、`animationend` 不触发 → overlay 残留在 `document.body`,灰色遮罩持续显示需刷新才消失。改用 `transition` + `opacity`/`scale`,终态由 `data-[state]` utility 写死,不依赖事件收敛。代价:丢失 slide 滑入效果,保留 fade + zoom

### Changed
- 版本 0.6.0 → 0.6.1

## [0.6.0] - 2026-07-07

### Added
- AI 代理配置 UI(超管可见):新建 `/settings` 页面,配置 worker 访问 OpenAI 的 HTTP 代理(host/port + 可选用户名/密码),含三档测试按钮(TCP / 经代理 HTTP 访问 OpenAI / 全链路 chat)。代理配置存 DB `proxy_config` 表(单行,密码 Fernet 加密复用 `secret_key`),`provider.chat` 每次读 DB 注入 `httpx.Client(proxy=...)` 到 OpenAI/Anthropic SDK,改完即生效(热生效,不重启 worker)。新增 `get_superadmin` 依赖;`UserResponse` 加 `is_superuser` 字段供前端显示齿轮入口

### Fixed
- `classify_task` 成功后未 publish `awaiting_feedback` 到 Redis pubsub(单批场景;多批 `merge_node` 已 publish)→ SSE 实时订阅收不到 `classify_ready`,前端不切提议态。改为成功后兜底 publish
- `classify_task` 失败时未 `graph.update_state` → 重连/`GET state` 读不到 `failed`,看不到失败提示。改为失败时 `update_state(status=failed, error)` + publish failed;`ClassifyState` 加 `error` 字段

### Changed
- `docker-compose.yml` 的 `backend`/`worker` 加 `extra_hosts: host.docker.internal:host-gateway`,容器内可经 `host.docker.internal` 访问宿主机代理(页面提示不要填 127.0.0.1)
- 版本 0.5.8 → 0.6.0

## [0.5.8] - 2026-07-07

### Changed
- 前端 UI 重构（样式 / 交互呈现 / 品牌化）：
  - 启用 next-themes 主题切换（AppLayout 顶栏 Sun/Moon 按钮，默认跟随系统 + localStorage 记忆）。暗色主题 CSS 变量此前已就绪但 next-themes 未挂载，现启用
  - 新增 `BrandMark` / `AuthShell` 品牌基础组件；AppLayout 顶栏 logo 与 Auth 三页（Login / Register / QrLogin）统一品牌头（ListMusic 图标 + 价值主张「AI 帮你整理 QQ 音乐歌单」）
  - SonglistInput 落地页重构：hero 区（标题「整理你的歌单」+ 价值主张）取代裸 h1；状态化主体（未绑 QQ 引导卡 / 加载骨架卡 / 空态 / 歌曲列表卡）；SSE 推送提示改为列表卡顶部 badge；歌曲行首加 `Music` 图标；单列 `max-w-2xl` 居中消解右侧留白
  - ClassifyWorkbench 图标化：类目卡 `Folder`、歌曲卡 `Music`、轮次徽章 `Repeat`、结果卡 `✓`/`✗` → `CircleCheck`/`CircleX`
  - 移除已绑 QQ 时冗余的「加载我的喜欢」按钮（自动拉取 + 列表卡「刷新」按钮覆盖等价能力；「刷新」按钮保留）

### 保留（边界）
- 分享链接入口仍注释（自 v0.5.7），本次不恢复（`TODO(后期恢复)` 保留）
- 已绑 QQ 自动拉取「我喜欢」行为不变，仅优化呈现节奏

## [0.5.7] - 2026-07-06

### Fixed
- uvicorn 转发日志到 loguru 时 `InterceptHandler.emit` 未 bind `logger_name`，导致 `_text_patcher` fallback 到 `-`（如 `2026-07-06 08:34:52 | INFO | - | ...`）。改为 `bind(logger_name=record.name)`，uvicorn/uvicorn.access/uvicorn.error 日志显示对应 logger 名
- `setup_logging` 原仅在 FastAPI lifespan 调用，导致：(1) uvicorn 启动早期 2 条日志（`Started server process` / `Waiting for application startup.`）在 lifespan 之前输出未走 loguru（`INFO:` 原生格式）；(2) worker/beat 不走 lifespan，celery 日志全用原生格式且未持久化。改为 `main.py` import 时即调用（幂等 `_initialized`），`celery_app.py` 连接 `signals.setup_logging` 接管 celery logging；拦截 `celery`/`celery.task` logger 并 `setLevel(DEBUG)` 避免 INFO 被标准 logging 层过滤

## [0.5.6] - 2026-07-06

### Fixed
- `POST /api/songlist/favorite/subscribe` cache miss 调 QQ 音乐接口偶发 `NetworkError`（超时）直接 502。改为自动重试 1 次（QQ 偶发超时重试大概率成功），重试仍失败才返回 502。新增 `fav_subscribe_retry` 日志事件便于观察重试频率

## [0.5.5] - 2026-07-06

### Fixed
- `POST /api/songlist/favorite/subscribe` 调 QQ 音乐 `u.y.qq.com` 偶发读超时（实测首次冷启动 ~5.1s）抛 `NetworkError` 直接冒泡 500。改为捕获返回 502 + 中文提示"QQ音乐接口暂时不可用，请稍后重试"

### Security
- loguru `logger.add()` 默认 `diagnose=True` 会把异常 traceback 的局部变量渲染进日志，导致 `Credential`（openid/refresh_token/access_token）明文落地 `logs/app.log`。两个 `logger.add()` 加 `diagnose=False`，traceback 调用栈仍保留但不再泄露局部变量

### Changed
- `QQMusicClient` 的 niquests timeout 从 `(5, 10)` 调到 `(5, 30)`：connect=5s 不通快速失败，read=30s 容忍 QQ 音乐偶发慢接口

## [0.5.4] - 2026-07-06

### Changed
- 前端错误展示重构：页面内 `<p className="text-destructive">` 文本改为弹框
  - API 错误（登录/注册/加载/启动/反馈/确认失败、SSE 推送断开、超量拦截）→ sonner toast 右上角通知
  - 表单校验错误（邮箱/密码格式）→ 输入框下方就近提示（`role="alert"`），关联具体字段
  - 分类任务失败（streamError）→ shadcn Dialog 模态框（流程终止级别，含"返回重选"按钮，强制用户确认）

### Added
- `frontend/src/components/ui/dialog.tsx`（shadcn 风格，基于 radix-ui 统一包，无新增依赖）

## [0.5.3] - 2026-07-06

### Changed
- `AI_API_KEY` 密钥校验从 production-only 放宽到任何环境都拒绝占位符/空值（dev 也校验）。此前 dev 下 `AI_API_KEY=<改>` 能启动，直到 worker 调 AI 时才报 `ascii codec can't encode character '改'` 不透明错误；现在启动即报"AI_API_KEY 未配置：请在 .env 填入真实 API Key"。`SECRET_KEY` / `SUPERADMIN_PASSWORD` 仍保持 dev 宽松（仅 production 强制）

## [0.5.2] - 2026-07-06

### Fixed
- 前端 nginx 反代 backend 用静态 `proxy_pass http://backend:8000`，启动时只解析一次主机名并缓存 IP——backend 容器重建后 IP 变化，nginx 仍连旧 IP 导致 502 Bad Gateway。改为 `resolver 127.0.0.11 valid=10s` + 变量化 upstream 动态解析，backend 重建后最多 10 秒自动切到新 IP，部署后无需手动重启 frontend

## [0.5.1] - 2026-07-06

### Fixed
- `check_user_daily`（每用户每日分类上限）此前为死代码——定义了但未挂任何端点，AI 成本控制形同虚设。新增 `enforce_classify_limits`（先 daily 后 interval），`start` 端点启用，日限真正生效
- `start` 端点 songs 数量校验提前到限流之前：songs 超量被拒不再消耗 30 秒间隔，用户改数量后可立即重试

### Changed
- `IPRateLimitMiddleware` 从全局（所有 `/api/*`）收窄到仅 `/api/auth/register`、`/api/auth/login`（防刷账号）；分类等业务端点靠用户级日限 + 分类间隔控制。修复 NAT 网络下正常用户被 IP 20/h 误限问题
- 429 响应 detail 中文化（"已达每日分类上限 N 次" / "操作过于频繁，N 秒后重试" / "IP 请求过于频繁，请稍后再试"）

### Removed
- `check_user_daily` / `check_classify_interval` 两个 Depends（被 `enforce_classify_limits` 取代）

## [0.5.0] - 2026-07-06

### Added
- 分批分类：songs 超 `classify_batch_size`（默认 200）时按顺序切批，各批独立 AI 分类 → `merge` 节点归一化同义类名 → 统一一轮 HITL；分类总上限 `classify_max_songs` 200→2000，支持全量歌曲
- LangGraph 新增 `split` / `batch_propose` / `merge` 节点 + `route_after_batch` 条件边（单批跳过 merge 省 AI 调用）
- merge 提示词 `build_merge_prompt`（归一化同义类名）；refine 提示词 `build_refine_prompt`（追加用户反馈 + 当前合并提案）
- `GET /api/classify/{thread_id}/stream` SSE 端点：推送 `classify_progress` / `classify_ready` / `classify_failed`，仿 stream.py 用 thread_id 作凭证（EventSource 不带 JWT）
- 前端 `useClassifyStream` hook + 分批进度 UI（"正在分类 N/M 批…"）+ 超量拦截（songs > 2000 提示筛选）

### Changed
- `POST /api/classify/start` 改异步：立即返回 `status:"running"` + 空 proposal，不再 `.get(timeout=120)` 同步等；Celery task 内跑完整流程并回写 `classify_propose_done` 审计
- `ClassifyState` 新增 `batches` / `batch_index` / `batch_proposals` / `total_batches` / `completed_batches` 字段
- 删除老 `propose_node`，统一 `batch_propose`（单批时 `total_batches==1` 直接写 proposal，跳过 merge）
- `rate_limit_user_daily` 默认 30→10（分批成本上调）；`classify_max_songs` 默认 200→2000；新增 `classify_batch_size`（默认 200）
- `StartResponse.proposal` / `iteration` 改默认值（适配异步 start 返回空 proposal）

## [0.4.0] - 2026-07-06

### Changed
- 前端 UI 重构：引入 shadcn/ui（new-york/slate）+ Tailwind CSS v4，主色由紫改青绿 Teal `#0D9488`
- 前端状态管理重构：TanStack Query（服务端态）+ Zustand（客户端态），替代散落 useState 与 `sessionStorage["classify_songs"]` 耦合
- Login / Register / QrLogin / SonglistInput / ClassifyWorkbench 全部用 shadcn Card / Button / Input / Textarea 重写
- Spinner / ErrorBoundary / AppLayout / AuthProvider 改用 shadcn + Tailwind
- 移除旧手写 CSS（约 660 行），统一 shadcn 主题变量 + 暗色模式变量预留

### Added
- 前端 `src/lib/`（`cn` / `errMsg` / `createQueryClient` 工具）、`src/stores/classify.ts`（Zustand store）、`src/hooks/queries.ts`（11 个 Query hooks）
- shadcn/ui 组件（button / card / input / label / textarea / sonner）
- `errMsg` 工具提取 axios detail，替代重复模板代码

### Removed
- `src/hooks/useClassify.ts`（被 store + Query hooks 取代）

## [0.3.0] - 2026-07-06

### Changed
- "我喜欢"歌曲拉取去除 500 首截断上限，改为全量拉取（`fetch_fav_songs` 的 `max` 默认值由 `_FAV_MAX=500` 改为 `None`，`/favorite` 端点、SSE 订阅、Celery 缓存三处调用点自动生效）

### Fixed
- 分享歌单 `/shared` 端点缺失分页循环，仅返回前 50 首：新增 `fetch_songlist_songs` 全量分页拉取，返回结构与 `/favorite` 对齐

## [0.2.2] - 2026-07-06

### Changed
- `CLAUDE.md` 新增「开发流程」章节：功能完成后自审 + 问题上报机制
- `.gitignore` 合并至根目录（删 `frontend/.gitignore`，规则统一）

### Removed
- `frontend/.gitignore`（内容并入根 `.gitignore`）

## [0.2.1] - 2026-07-06

### Fixed
- `.env` 迁移漏改同步：`README.md` / `docs/CONTRIBUTING.md` / `docs/RUNBOOK.md` 中残留的 `backend/.env` 路径修正
- `docs/CONTRIBUTING.md` 环境变量表补 `VITE_API_BASE_URL` / `VITE_QR_POLL_INTERVAL` / `VITE_CLASSIFY_MAX_ITERATIONS`

## [0.2.0] - 2026-07-06

### Added
- 版本管理机制：根 `VERSION` 文件为单一真相源，`FastAPI(version=)` 暴露后端运行时版本至 `/openapi.json` 与 `/docs`
- 配置层集中：根 `.env` + `.env.example`，docker / 后端 / 前端共用
- 前端配置层 `frontend/src/config.ts`，`VITE_` 环境变量可配 + 默认值
- 生产环境密钥强制校验：`SECRET_KEY` / `AI_API_KEY` / `SUPERADMIN_PASSWORD` 拒绝默认/空值
- `docs/CHANGELOG.md` 版本记录文档

### Changed
- 后端 `config.py` 改用 `load_dotenv` 显式加载根 `.env`，去掉 `env_file` 自动读取
- `docker-compose.yml` 各服务补 `image:` 版本标签，`env_file` 统一指向根 `.env`
- 前端 `api.ts` / `useClassify` / `QrLogin` 硬编码值改读 `config.ts`（API 基址、扫码轮询间隔、分类最大轮次）
- `vite.config.ts` 加 `envDir: "../"`，使 vite 读取项目根 `.env`

### Removed
- `backend/.env`、`backend/.env.example`（迁移至项目根目录）

## [0.1.0] - 2026-07-03

### Added
- 邀请码注册 + 邮箱密码登录（JWT 鉴权，access/refresh 双 token）
- QQ 扫码登录态服务端持久化（Fernet 加密，refresh_token 自动刷新 musickey）
- "我喜欢" / 分享歌单双入口取歌，按 song_id 精确添加保证版本一致性
- AI 多轮 HITL 分类（LangGraph 工作流 + Redis checkpoint，最多 5 轮反馈）
- Celery + Redis 任务队列
- Docker Compose 一键部署（backend / worker / beat / frontend / redis）
- loguru 纯文本人类可读日志 + 文件持久化 + rotation
- 邀请码 + 公开注册开关 + 用户级/IP 级限流
