# 前端现状总结

> 范围：`frontend/` 全部页面 + 样式系统 + 状态/hooks 分层。
> 用途：作为下一轮"样式/交互重构"讨论的现状基线，与 `frontend-refactor.md`（旧版重构计划）形成前后对照。
> 日期：2026-07-07
> 视角：UI 设计师 + 前端工程师

## 一、技术栈与架构

| 维度 | 选型 |
|---|---|
| 框架 | React 19 + TypeScript 6 |
| 构建 | Vite 8 |
| 路由 | react-router-dom 7 |
| 状态 | Zustand（分类工作台本地态）+ TanStack Query v5（服务端态） |
| 样式 | Tailwind CSS 4 + shadcn/ui（radix-ui 基底）+ 自定义青绿 Teal 主题 |
| 拖拽 | @dnd-kit/core |
| 图标 | lucide-react（已装但当前页面几乎未用） |
| 通知 | sonner（toast） |

架构分层清晰：`pages/` 页面 + `components/` 通用组件 + `components/ui/` shadcn 原子组件 + `hooks/queries.ts` 数据层 + `stores/` 本地态 + `api.ts` HTTP 封装。

## 二、路由与页面结构

```
/login          Login          (公开)
/register       Register       (公开)
/qr             QrLogin        (公开，但需先有账号)
─── 以下受 ProtectedRoute 保护，套 AppLayout（顶栏 + 居中内容区） ───
/songlist       SonglistInput  (默认落地页，选歌单入口)
/classify/:id   ClassifyWorkbench (分类工作台)
*               → 重定向到 /songlist
```

`AppLayout` 极简：左侧 "TuneSet" 文字 logo（链 /songlist），右侧已登录用户邮箱 + 登出按钮，内容区 `max-w-5xl` 居中。

## 三、各页面功能详解

### 1. Login / Register（账号体系）
- 居中卡片表单，邮箱 + 密码（注册多一个邀请码，可选）。
- 前端校验：邮箱正则、密码 8-64 位。
- 已登录用户访问会自动 `<Navigate to="/songlist">`。
- 两页互相跳转链接。视觉上是纯白卡片 + Teal 主色按钮，无品牌氛围。

### 2. QrLogin（QQ 音乐扫码绑定）
- 状态机驱动：`loading → waiting → scanned → success`（或 `expired/error/network_error/device_limit`）。
- 轮询 `check` 接口（config.qrPollInterval 默认 2s），过期自动刷新二维码。
- 未登录账号访问会引导去 `/login`。
- 成功后 800ms 延迟跳 `/songlist`。

### 3. SonglistInput（选歌单 —— 当前默认落地页）
**双入口设计已被裁剪**：粘贴分享链接入口在 v0.5.7 被整段注释（`TODO(后期恢复)`），目前只剩"扫码取我喜欢"一条路。

当前一进页面的呈现：
1. 一个标题 `选择歌单`
2. 一张 Card「扫码取"我喜欢"」：
   - 已绑 QQ → 显示"加载我的喜欢"按钮
   - 未绑 QQ → 显示"去扫码登录"按钮
3. **已绑 QQ 的用户一进来就自动 `subscribeFav()`**（useEffect 触发），不需要点按钮就开拉。
4. 加载后下方出现歌曲列表 Card：序号 + 歌名 + 歌手，`max-h-[420px]` 滚动，顶部显示"已加载 N 首 · 每 X 秒刷新"+ 刷新/开始分类按钮。
5. 通过 EventSource（SSE）持续接收 `fav_update` 实时刷新歌曲列表。

### 4. ClassifyWorkbench（分类工作台 —— 核心）
多状态条件渲染，同一组件承担 5 种视图：

| 状态 | 视图 |
|---|---|
| `results` 已有结果 | 建歌单结果卡：每个类目 → 歌单 ID + 成功/失败 + "完成"按钮回 /songlist |
| `streamError` | Dialog 弹窗"分类失败"，返回重选 |
| `status === "running"` + progress | 分批进度卡：`正在分类 X/Y 批…` + Spinner |
| `running` 无 progress | 纯 Spinner "分类启动中…" |
| 正常态 | 工作台主体 |

正常态主体：
- 顶栏：标题 + 轮次徽章 `第 N/5 轮`
- **dnd-kit 拖拽区**：`grid auto-fill minmax(240px,1fr)` 自适应多列类目卡，每张卡显示类目名 + 数量 + 可拖入歌曲；歌曲卡显示歌名 + AI 给的理由（reason）
- 已记录拖拽数提示
- 文字反馈 Textarea（"把某首歌改到另一类"）
- 操作按钮组：提交反馈（重新分类）/ 确认建歌单 / 取消
- 文案引导：未到上限提示拖拽+反馈，达上限提示将生成计划

SSE 流（`useClassifyStream`）处理 `classify_progress` / `classify_ready` / `classify_failed` 三类事件。

## 四、状态管理与数据流

- **服务端态** 全走 TanStack Query：`useMe` / `useQqStatus` / `useClassifyState` / 各 mutation。
- **分类工作台本地态** 集中在 `stores/classify.ts`（Zustand）：items、iteration、status、dragLog、results、songNames、progress、streamError。拖拽只改本地态，提交反馈时才把 `dragLog` 上送。
- 登录态：`AuthProvider` 通过 `useMe` 拉用户，`logout` 清 token + 跳 /login。JWT 存 localStorage（`api.ts` 里 `isLoggedIn`/`clearToken`）。

## 五、视觉风格

- **主色**：青绿 Teal（`#0d9488` 亮色 / `#2dd4bf` 暗色），已定义完整明暗双主题，但**当前没有任何主题切换 UI**（装了 next-themes 却未启用）。
- **基调**：白底 + 卡片 + 细边框，极简工具风。
- **字体**：系统默认，无品牌字。
- **布局**：统一 `max-w-5xl` 居中，`p-8` 内边距，信息密度中等。
- **动效**：几乎没有，只有 Spinner 和拖拽 `transition-shadow`。

## 六、当前进入页面的呈现问题（重构靶子）

下一轮重构讨论的入手点，仅列症状，不下结论：

1. **落地即裸 Card**：一进 `/songlist` 就是一个标题 + 一张按钮卡，没有 hero、没有产品价值主张、没有引导路径，工具感过强、品牌感为零。
2. **双入口退化成单入口**：分享链接入口被注释后，页面右侧留白，本应 `grid-cols-2` 双列布局塌成单列，视觉上更"空"。
3. **自动拉取"我喜欢"略突兀**：已绑 QQ 用户一进来不等点击就开拉 + 开 SSE 推送，加载态、刷新提示直接糊在面上，缺少节奏感。
4. **未绑 QQ 用户路径单薄**：只有一个"去扫码登录"按钮，没有说明绑定的好处/后果，也没有返回其他操作的余地。
5. **登录/注册页无品牌氛围**：纯白卡片，和后台管理后台无异，与"AI 帮你整理歌单"的产品调性不匹配。
6. **暗色主题已就绪但无入口**：`next-themes` 装了、CSS 写了，却没有切换按钮，能力闲置。
7. **lucide 图标几乎未用**：按钮和卡片都是纯文字，缺少视觉锚点。
