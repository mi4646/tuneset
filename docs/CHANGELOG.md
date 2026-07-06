# 变更记录

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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
