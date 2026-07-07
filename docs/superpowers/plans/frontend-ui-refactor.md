# 前端 UI 重构方案（样式 / 交互呈现 / 品牌化）

> 范围：`frontend/` 5 个页面的视觉与交互呈现层 + 主题基础设施。
> 基线：`docs/frontend-current-state.md`（2026-07-07 现状基线，7 个重构靶子）。
> 对照：`docs/superpowers/plans/frontend-refactor.md`（旧版重构计划，技术栈前提已过时，本计划取代之）。
> 性质：样式 / 布局 / 品牌化重构，不改功能行为、不改状态管理、不引入新依赖。
> 日期：2026-07-07

## 一、背景

旧版 `frontend-refactor.md` 的前提是"不引入 UI 库 / 状态库，保持 axios 原栈"，但实际前端早已升级到 Tailwind 4 + shadcn/ui + Zustand + TanStack Query + sonner + next-themes + lucide-react。旧计划已被超越，不可沿用。

本计划基于 `frontend-current-state.md` 列出的 7 个重构靶子，做"样式 / 交互呈现 / 品牌化"层面的重构。靶子编号沿用基线文档：

1. 落地即裸 Card，无 hero / 价值主张 / 引导
2. 双入口退化成单入口（分享链接被注释），右侧留白塌成单列
3. 已绑 QQ 用户一进来就自动拉取 + SSE，缺少节奏
4. 未绑 QQ 路径单薄，无说明无余地
5. 登录 / 注册页无品牌氛围，纯白卡片像后台
6. 暗色主题已就绪但无切换入口（next-themes 装了未启用）
7. lucide 图标几乎未用，全是纯文字

## 二、范围与边界

### 做（本次范围）

- **主题基础设施**：启用 next-themes（已装未挂）+ 顶栏切换按钮 → 靶子 6
- **品牌化**：AppLayout logo、Auth 三页品牌壳、SonglistInput hero → 靶子 1 / 4 / 5
- **布局优化**：SonglistInput 单入口布局消解右侧留白 → 靶子 2 的布局面
- **呈现节奏**：SonglistInput 加载态骨架化、SSE 提示柔和化 → 靶子 3 的呈现面
- **图标锚点**：各页面引入 lucide 图标 → 靶子 7

### 不做（明确排除，需在 commit message 注明以免误判为遗漏）

- **不恢复分享链接入口**：靶子 2 的功能恢复属行为变更，本次只做布局优化，不恢复被注释的粘贴链接入口（`TODO(后期恢复)` 注释保留）
- **不改自动拉取行为**：靶子 3 的"已绑 QQ 一进来就自动 `subscribeFav`"行为保留，本次只优化其加载 / 推送的呈现节奏，不改"自动拉取"本身
- 不动 dnd-kit 拖拽逻辑、Zustand store、TanStack Query、API 层、类型
- 不引入新依赖（next-themes / lucide-react 已装）
- 不引入品牌字体（维持系统默认字体）
- 主色保留 Teal 青绿
- 不改路由结构、不改后端

## 三、设计决策

### D1. 主色：保留 Teal

现状 `index.css` 已有完整 Teal 色阶（teal-50…900）+ 明暗双主题 CSS 变量（`:root` 亮 / `.dark` 暗），保留不动。

### D2. 主题切换：next-themes `attribute="class"`

- `main.tsx` 包 `<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>`
- 与现有 `@custom-variant dark (&:is(.dark *))` + `.dark` class 联动（next-themes class 模式把 `.dark` 加到 `<html>`，匹配一致，已确认）
- AppLayout 顶栏加 `ThemeToggle`：lucide `Sun` / `Moon` 图标按钮，`useTheme()` 驱动；默认跟随系统，localStorage 由 next-themes 自动记忆
- shadcn 原子组件已带 `dark:` 变体，无需额外适配

### D3. 品牌标识：`BrandMark` 组件

- 新建 `components/BrandMark.tsx`：lucide `ListMusic` 图标 + "TuneSet" 文字（文字为 `<Link to="/songlist">` 或纯文本，按使用场景传 `as` prop）
- AppLayout 顶栏、Auth 三页品牌头、SonglistInput hero 复用

### D4. Auth 三页：`AuthShell` 组件

- 新建 `components/AuthShell.tsx`：`min-h-svh` 居中 + 顶部 `BrandMark` + 一句话价值主张 + `children`（卡片）
- Login / Register / QrLogin 三页公用，消除重复的居中壳
- 价值主张文案建议："AI 帮你整理 QQ 音乐歌单"（陛下可改）

### D5. SonglistInput 落地页：hero + 状态化主体

顶部 hero（静态，取代现状 `h1 选择歌单`）：

- 大标题"整理你的歌单"
- 价值主张"AI 帮你分类 QQ 音乐「我喜欢」，按 song_id 精确建歌单，版本一致不串味"

hero 下方主体（按状态渲染，单列居中 `max-w-2xl`，消除"右侧留白塌成单列"空感）：

- **未绑 QQ**：绑定引导卡（说明绑定好处：加载我喜欢 + 实时同步；主 CTA "去扫码绑定" → `/qr`）→ 消解靶子 4
- **已绑 QQ · 加载中**（`songs` 空 + `loading`）：骨架列表卡（3–5 行占位）→ 消解靶子 3
- **已绑 QQ · 已加载**：歌曲列表卡（现状结构，加 `Music` 图标行首 + SSE badge 呈现"实时同步中 · 每 X 秒"）→ 消解靶子 2 空感

呈现清理（边界内，不改变可达成功能）：

- 移除已绑 QQ 时冗余的"加载我的喜欢"按钮——自动拉取 + 列表卡顶部"刷新"按钮已覆盖等价能力（自动拉取做首屏，刷新做显式重拉）
- SSE 推送提示从"糊在面上"改为列表卡顶部 badge 形式

### D6. 图标锚点（靶子 7）

| 位置 | 图标（lucide） |
|---|---|
| `BrandMark` | `ListMusic` |
| `ThemeToggle` | `Sun` / `Moon` |
| SonglistInput 歌曲行首 | `Music` |
| SonglistInput 未绑引导卡 | `QrCode`（CTA 前） |
| ClassifyWorkbench 类目卡头 | `Folder` |
| ClassifyWorkbench 轮次徽章 | `Repeat` |
| ClassifyWorkbench 结果卡 | `CircleCheck`（成功）/ `CircleX`（失败）替代 `✓` / `✗` |
| Auth 三页 | 品牌头由 `BrandMark` 承载，表单保持简洁不加输入框前缀图标 |

所有图标均来自已装的 `lucide-react`，不引入新依赖。

## 四、阶段划分

### 阶段 0：主题基础设施 → 靶子 6

- `src/main.tsx` 挂 `ThemeProvider`（attribute="class", defaultTheme="system", enableSystem, disableTransitionOnChange）
- 新建 `src/components/ThemeToggle.tsx`
- `src/components/AppLayout.tsx` 顶栏加 `ThemeToggle`
- **验收**：亮 / 暗切换生效、刷新记忆、暗色下各页面不破、`pnpm lint` + `pnpm build` + `pnpm typecheck` 通过

### 阶段 1：品牌基础组件 → 靶子 1 / 5 的地基

- 新建 `src/components/BrandMark.tsx`
- 新建 `src/components/AuthShell.tsx`
- **验收**：组件可复用、`pnpm lint` + `pnpm build` 通过

### 阶段 2：Auth 三页品牌化 → 靶子 5

- `Login.tsx` / `Register.tsx` 改用 `AuthShell` + 品牌头
- `QrLogin.tsx` 改用 `AuthShell` + 品牌头（未登录引导态 + 扫码态都套）
- **验收**：三页品牌一致、`pnpm lint` + `pnpm build` 通过

### 阶段 3：SonglistInput 落地页重构 → 靶子 1 / 2 / 3 / 4

- 加 hero 区（取代 `h1`）
- 状态化主体（未绑引导 / 加载骨架 / 已加载列表）
- 移除冗余"加载我的喜欢"按钮（功能等价保留）
- SSE badge 呈现
- 歌曲列表行加 `Music` 图标
- **验收**：落地页有节奏、无空感、未绑路径有引导、`pnpm lint` + `pnpm build` 通过

### 阶段 4：ClassifyWorkbench 样式收尾 → 靶子 7

- 类目卡头 `Folder`、轮次徽章 `Repeat`、歌曲卡行首 `Music`
- 结果卡 `✓` / `✗` → `CircleCheck` / `CircleX`
- **验收**：`pnpm lint` + `pnpm build` 通过

### 阶段 5：收尾

- 确认 `public/favicon.svg` 存在（`index.html` 已引用，避免 404）
- 全量 `pnpm lint` + `pnpm build` + `pnpm typecheck`
- 全流程手测：登录 → 选歌单 → 分类 → 拖拽反馈 → 确认；亮 / 暗切换；未绑 QQ 引导路径
- **验收**：无回归

## 五、新增 / 改动文件清单

**新增：**

- `src/components/ThemeToggle.tsx`
- `src/components/BrandMark.tsx`
- `src/components/AuthShell.tsx`

**改动：**

- `src/main.tsx`（挂 `ThemeProvider`）
- `src/components/AppLayout.tsx`（`BrandMark` + `ThemeToggle`）
- `src/pages/Login.tsx`（`AuthShell`）
- `src/pages/Register.tsx`（`AuthShell`）
- `src/pages/QrLogin.tsx`（`AuthShell`）
- `src/pages/SonglistInput.tsx`（hero + 状态化主体 + 骨架 + 图标）
- `src/pages/ClassifyWorkbench.tsx`（图标化）

**不动：**

- `src/index.css`（明暗主题变量已就绪；如阶段 0 发现需微调，单独在阶段 0 内一并）
- `src/api.ts` / `src/types.ts` / `src/config.ts` / `src/stores/` / `src/hooks/` / `src/lib/`
- `src/components/ui/*`（shadcn 原子，保持原样）
- `src/components/Spinner.tsx` / `ProtectedRoute.tsx` / `ErrorBoundary.tsx` / `AuthProvider.tsx`

## 六、执行方式

subagent-driven：每阶段独立完成后自检（`pnpm lint` + `pnpm build` + `pnpm typecheck`），通过即 commit，自动推进下一阶段。执行时 announce："使用 subagent-driven 方式执行计划"。

每阶段 commit message 用 `refactor(frontend): ...`，并在涉及"不改行为边界"的 commit 里注明（如阶段 3 注明"不恢复分享链接入口、不改自动拉取行为"）。

## 七、版本管理

- 性质：`refactor`（样式 / 呈现重构，无功能新增）
- 按 CLAUDE.md SemVer 判定：`refactor` → patch
- 全部阶段完成、全流程手测通过后，升 patch 版本：
  1. 更新 `VERSION` + `backend/pyproject.toml` + `frontend/package.json` + `docker-compose.yml` 标签
  2. `docs/CHANGELOG.md` 追加条目
  3. 独立 commit `chore(release): vX.Y.Z`
  4. 打 git tag `vX.Y.Z`

## 八、风险与确认项

- **R1**：next-themes 与现有 `@custom-variant dark` 联动——已确认 `attribute="class"` 与 `.dark` 选择器匹配，无风险。
- **R2**：暗色下 shadcn 组件已有 `dark:` 变体——无需额外适配；骨架行需注意暗色对比度（用 `bg-muted` 占位即可）。
- **R3**：移除"加载我的喜欢"按钮——属呈现清理，功能等价（自动拉取 + 列表卡"刷新"按钮覆盖），但属轻微交互变化，已在边界说明，commit 注明。
- **R4**：价值主张文案"AI 帮你整理 QQ 音乐歌单" / hero 标题"整理你的歌单"——为建议，陛下可改。
