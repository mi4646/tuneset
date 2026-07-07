# TuneSet

把 QQ音乐"我喜欢"/他人歌单的歌曲，用 AI 分类成多个新歌单，保证版本一致性。

## 核心机制

- **版本一致性**：用 `SonglistApi.add_songs(dirid, [(song_id, song_type), ...])` 按 song_id 精确添加，绕开 QQ音乐按歌名模糊匹配导致的版本错配。
- **依赖库**：[L-1124/QQMusicApi](https://github.com/L-1124/QQMusicApi)（Python 异步），`pip install qqmusic-api-python`。命门接口详见 `docs/qqmusic-api-interfaces.md`。

## 技术栈

- 后端：Python + FastAPI（纯 API）
- 前端：React SPA（dnd-kit 做分类拖拽）
- 任务队列：Celery + Redis（task 内 `asyncio.run` 包异步调用，因 L-1124 库全异步）
- AI 编排：**LangGraph**（多轮 HITL 工作流 + state + checkpoint）
- AI 模型：`anthropic` + `openai` 双 SDK，LangGraph 节点内调用，开发者后台配置
- DB：SQLite（用户账号 + 邀请码）
- 认证：JWT（无状态）+ 邮箱密码
- 部署：个人服务器

## 关键约束

- **用户系统**：邀请码注册 + 可配公开注册开关；邮箱+密码登录，JWT 鉴权
- **QQ登录态**：服务端持久化加密 credential（SQLite `users.qq_credential_enc`，Fernet 加密 `secret_key`），跨会话/跨设备共享；`refresh_token` 自动刷新 musickey，避免频繁扫码导致 20279 设备超限；SSE 推送仍按 euin 临时缓存（Redis，TTL=推送间隔×2，连接断开清理）；解绑走 `/api/qq/unbind`（方案⑤调整，独立于账号 JWT）
- **AI 成本**：开发者承担，所有用户共用 → 必须强限流（用户级 + IP/频率/单次/轮次上限）
- **分类模式 C（多轮 HITL）**：AI 提议 → 用户拖拽+对话反馈 → AI 带上下文重分类，**最多 5 轮** → 确认落库
- **分批分类**：songs 超阈值时按顺序切批，各批独立分类 → `merge` 节点归一化同义类名 → 统一一轮 HITL；`/classify/start` 异步返回 thread_id，SSE 推批次进度；参数与机制详见 `docs/superpowers/plans/batch-classify-design.md`
- **反馈形式**：拖拽（dnd-kit）+ 对话文本输入结合
- **分类依据**：歌名+歌手+`get_labels` 标签，缺标签补 `get_lyric` 歌词
- **双入口**：扫码登录取"我喜欢" / 粘贴分享链接取任意歌单
- **存储分工**：SQLite 存用户账号/邀请码；Redis 存 Celery/LangGraph checkpoint/限流计数
- **LangGraph checkpoint**：复用 Redis，按 `thread_id` 跨 HTTP 请求维持分类状态

## 开发流程

- **干活前先提问**：收到非平凡任务时，先向【陛下】提问直到获取完美执行任务所需的全部背景信息，再动手。每项提问给出问题建议——不擅自决策、不沉默选路。设计类任务先产出方案文档（`docs/superpowers/plans/`）/ （`docs/`）经陛下拍板再落代码。
- **功能完成后自审**：每次添加完功能，先自审/review改动（正确性、边界、是否符合现有约定），再决定：
  - 自审通过 → 直接 commit（提交规范见 `docs/CONTRIBUTING.md`）
  - 自审发现问题 → **不擅自决策**，告知用户问题 + 建议方案，由用户拍板
- **不隐瞒问题**：发现潜在风险（破坏性改动、设计抉择、不确定项）立即上报，不自行绕过

## 版本管理

- **真相源**：根目录 `VERSION` 文件（单行纯文本，如 `0.2.0`）
- **后端运行时版本**：`backend/app/main.py` 的 `FastAPI(version=_read_version())` 自动读 `VERSION`，暴露在 `/openapi.json` 与 `/docs`
- **同步范围**（升版本时手动改）：
  - `VERSION`（真相源）
  - `backend/pyproject.toml` 的 `version`
  - `frontend/package.json` 的 `version`
  - `docker-compose.yml` 各服务 `image:` 标签
- **判定标准**（SemVer + Conventional Commits）：
  - `feat` → minor；`fix`/`refactor`/`perf`/`docs` → patch
  - `BREAKING CHANGE` / `feat!` → major；`chore`/`ci`/`test` → 不升
- **触发时机**：commit 后由 Claude 判定是否升版本；不升则不动；升则：
  1. 更新 `VERSION` + 同步 `pyproject.toml` + `package.json` + `docker-compose.yml` 标签
  2. 在 `docs/CHANGELOG.md` 追加条目（Keep a Changelog 格式）
  3. 独立 commit `chore(release): vX.Y.Z`
  4. 打 git tag `vX.Y.Z`
- **记录文档**：`docs/CHANGELOG.md`

## 配置管理

- **真相源**：根 `.env`（docker + 后端 + 前端共用），`.env.example` 为模板（入库）
- **后端**：`backend/app/config.py` 用 `pydantic-settings` + `load_dotenv` 显式加载根 `.env`，必要参数均 settings 可配 + 默认值
- **前端**：`frontend/src/config.ts` 用 `VITE_` 环境变量（vite 构建期注入），必要参数均可配 + 默认值；`vite.config.ts` 的 `envDir: "../"` 指向项目根 `.env`
- **规则**：新增 settings 性质参数必须走可配 + 默认值，禁止硬编码；vite 仅暴露 `VITE_` 前缀变量给客户端 bundle，后端密钥不会泄露
- **密钥类强制校验**：`SECRET_KEY` / `AI_API_KEY` / `SUPERADMIN_PASSWORD` 在 `app_env=production` 下拒绝默认/空值，启动即报错

## 日志规范

后端使用 `loguru`（纯文本人类可读输出 + 文件持久化），前端不强制。

### 级别

- `INFO`：关键业务节点（请求到达、状态变更、完成）
- `WARNING`：可恢复异常（限流、过期、降级）
- `ERROR`：不可恢复错误（异常、失败）
- `DEBUG`：详细调试（默认不输出）

### 必填字段

- `event`：事件名（snake_case，如 `qq_login_done`）
- `level`：日志级别（loguru 自动加）
- `timestamp`：UTC（format 自动渲染，格式 `YYYY-MM-DD HH:mm:ss.SSS`）

### 输出格式

纯文本单行，` | ` 分隔：`时间(UTC) | 级别(左对齐8位) | logger名 | event | 业务字段 k=v`。无业务字段时尾部 `k=v` 段省略。健康检查 access log（`/api/health 200`）过滤不输出。

### 语言约定

- `event` 名：英文 snake_case（机器字段，便于 grep/告警/统计锚点）
- 业务描述性字段（如 `reason`、`error`、`detail`、`提示` 等）：用中文，便于运维理解
- 第三方库自带消息（uvicorn 等）：保持原文，不强制翻译
- 示例：`log.warning("qq_login_failed", reason="设备超限")`，而非 `reason="device limit exceeded"`

### 业务字段（按场景）

- `user_id`：账号 ID
- `thread_id`：分类任务线程
- `euin_masked`：QQ 加密 UIN（脱敏）
- `duration_ms`：耗时
- `error`：错误信息

### 脱敏规则

- `credential` / `musickey` / `refresh_token` / `access_token`：**禁止打印**
- `euin`：用 `mask()` 保留前 4 + 后 4，中间 `***`
- 业务 ID（song_id / thread_id 等）：不脱敏

### 使用

```python
from app.logging import get_logger, mask

log = get_logger(__name__)
log.info("event_name", field=value, euin_masked=mask(euin))
```

### 持久化

- 双输出：stdout（docker logs）+ 文件（`/app/logs/app.log`，docker volume 挂载宿主机 `./logs/`）
- Rotation：`log_max_bytes`（默认 10MB）超出切分，`log_backup_count`（默认 5）保留旧文件，zip 压缩
- 多进程安全：loguru `enqueue=True`（celery worker prefork 多进程同写不冲突）
- 配置：`.env` 的 `LOG_FILE` / `LOG_MAX_BYTES` / `LOG_BACKUP_COUNT`

## 文档

- 完整方案决策：`docs/plan.md`
- QQMusicApi 接口确认：`docs/qqmusic-api-interfaces.md`
- 变更记录：`docs/CHANGELOG.md`
- `docs/superpowers/`：本地设计 spec，**本项目入库**（例外于全局 CLAUDE.md 第 5 条；其他项目默认仍过滤）。**计划/设计文档放 `docs/superpowers/plans/`**
