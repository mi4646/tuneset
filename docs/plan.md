# TuneSet 项目落地方案

> 2026-07-03 确认的核心决策（含 LangGraph + 用户系统调整）。

## 项目定位

TuneSet 是一个 web 应用：把 QQ音乐"我喜欢"或他人歌单里的歌曲，用 AI 分类成多个新歌单（如华语流行/古风/粤语），保证版本一致性。

**核心痛点**：QQ音乐自带导入按歌名模糊匹配，会匹配到用户不喜欢的版本；本项目用 `song_id` 精确添加绕开此问题。

## 核心决策

| # | 项 | 决策 |
|---|---|---|
| 1 | 痛点机制 | `add_songs` 按 `(song_id, song_type)` 精确添加 |
| 2 | 依赖库 | L-1124/QQMusicApi（Python 异步），命门接口全有 |
| 3 | 入口 | 双入口：扫码登录取"我喜欢" / 粘贴分享链接取任意歌单 |
| 4 | 分类模式 | C（多轮 HITL）：AI 提议类别 → 用户拖拽+对话反馈 → AI 带上下文重分类，循环最多 5 轮 → 确认落库 |
| 5 | 分类依据 | 歌名+歌手+`get_labels` 标签，缺标签补 `get_lyric` 歌词 |
| 6 | 形态 | 普通 web 应用 + AI 分类（非全自动 agent） |
| 7 | 规模 | 公开服务，需注册才能使用 |
| 8 | 后端 | Python + FastAPI（纯 API） |
| 9 | 部署 | 个人服务器 |
| 10 | QQ登录态 | 方案⑤调整：服务端持久化加密 credential，refresh_token 自动刷新，跨会话/跨设备共享，解绑走 /api/qq/unbind |
| 11 | AI 模型 | 开发者后台配置，所有用户共用（非用户自配） |
| 12 | AI 职责 | 基于 LangGraph 的多轮 HITL 分类工作流（详见第 18 条） |
| 13 | 用户系统 | **有**：邀请码注册 + 可配公开注册开关 |
| 14 | 成本风险 | 开发者承担 AI 成本 + 强限流（用户级 + IP 级 + 频率 + 单次上限 + 轮次上限） |
| 15 | 前端 | React SPA（dnd-kit 做分类拖拽） |
| 16 | 任务队列 | Celery + Redis（task 内 `asyncio.run` 包异步调用；LangGraph checkpoint 复用 Redis） |
| 17 | AI 对接 | LangGraph 编排工作流（节点/边/interrupt），节点内调 `anthropic`/`openai` 双 SDK，按配置分流 |
| 18 | AI 框架 | **LangGraph**——原生 HITL（interrupt）、StateGraph 状态管理、Checkpoint 持久化，匹配多轮交互；AutoGPT 不匹配（全自动无 HITL），LangChain 单用不如 LangGraph |
| 19 | 反馈形式 | 拖拽（dnd-kit）+ 对话文本输入结合。拖拽处理直观调整，对话处理批量意图（如"把周杰伦都归华语流行"） |
| 20 | 轮次上限 | 每个分类任务最多 5 轮 AI 重分类，超过提示确认当前结果或重新开始（防刷+控成本） |
| 21 | 认证方式 | 邮箱 + 密码（不强制邮件验证，省 SMTP） |
| 22 | 存储 | SQLite 存用户账号 + 邀请码；Redis 存临时状态（Celery/LangGraph checkpoint/限流计数） |
| 23 | 账号登录态 | JWT（无状态，服务端不存） |
| 24 | 注册策略 | 默认邀请码注册；开发者可通过配置开启公开注册入口（开启后前端显示公开注册按钮，无需邀请码） |

## 关键说明

- **第 11/13 条的演变**：最初"用户自配 AI Key"→ 纠正为"开发者配"并撤回用户系统 → 后因担心"谁都能用"风险，又恢复用户系统。最终：开发者承担 AI 成本 + 用户系统 + 强限流。
- **第 13/24 条的用户系统**：默认邀请码注册（可控），保留可配的公开注册开关（灵活）。开发者可在配置里切换是否开放公开注册入口。
- **第 14 条的风险与限流**：公开服务 + 开发者承担 AI 成本 = 必须强限流。用户级限流（每用户每天 N 次分类）比 IP 级更精准，有效控制成本。第 20 条的轮次上限也是限流的一部分。
- **第 16 条的摩擦点**：L-1124/QQMusicApi 完全异步，Celery worker 默认同步，需在 task 内用 `asyncio.run()` 包装异步调用。LangGraph 的 checkpoint 复用同一 Redis，不增加组件。
- **第 12/18 条的多轮 HITL**：AI 一次分类不一定合用户心意，需多轮交互逼近。LangGraph 的 `interrupt_before`/`interrupt_after` 让图在"等用户反馈"处暂停，checkpoint 存 Redis 跨 HTTP 请求维持状态。每个分类任务用 `thread_id` 关联。
- **第 19 条的反馈形式**：拖拽+对话结合工程量最大，但兼顾直观和灵活。对话指令由 AI 在 `apply_feedback` 节点解析（LLM 理解自然语言意图后重分类）。
- **第 22 条的存储**：用户账号必须持久化 → SQLite（个人服务器零运维）。Redis 承担所有临时状态（Celery broker/backend、LangGraph checkpoint、限流计数）。Redis 重启丢临时状态可接受；SQLite 重启不丢用户账号。
- **第 23 条的两套登录态**：TuneSet 账号用 JWT（长期有效，无状态，放请求头）；QQ音乐登录态原方案⑤前端持有，2026-07-06 起调整为服务端持久化（SQLite 加密存 credential，refresh_token 自动刷新 musickey，跨会话/跨设备共享，解绑走 `/api/qq/unbind`）。两套独立。

## LangGraph 工作流（粗描）

```
[拉取歌曲] → [propose: AI 提议类别] → [classify: AI 出分类草案] → ⏸ interrupt（等用户反馈）
                                                                       ↓
                                                            ┌──────────┴──────────┐
                                                            │ 用户：拖拽 + 对话指令 │
                                                            └──────────┬──────────┘
                                                                       ↓
                                                  [apply_feedback: AI 带反馈+历史重分类] → ⏸ interrupt
                                                                       ↓
                                                            （继续反馈 or 确认，最多 5 轮）
                                                                       ↓
                                                            [finalize: 建歌单 + add_songs]
```

- **State**：歌曲列表、当前类别、分类映射、反馈历史、轮次计数
- **节点**：`propose` → `classify` → `interrupt` → `apply_feedback`（循环）→ `finalize`
- **Checkpoint**：Redis，按 `thread_id` 关联，跨 HTTP 请求维持暂停状态

## 接口能力

依赖库的命门接口确认详见 [QQMusicApi 命门接口](./qqmusic-api-interfaces.md)。
