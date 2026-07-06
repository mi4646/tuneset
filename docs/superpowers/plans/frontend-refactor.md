# 前端全面重构计划

> 范围：`frontend/` 5 个页面 + 样式系统 + 状态/hooks 抽取。
> 不引入 UI 库 / 状态管理库，保持 React 19 + react-router-dom 7 + dnd-kit + axios 原栈。

## 现状问题

1. `ClassifyWorkbench` 未实现 dnd-kit 拖拽（核心功能缺失，CLAUDE.md 要求"拖拽+对话反馈"）。
2. `index.css`/`App.css` 大量 Vite 脚手架残留（`.hero`/`#next-steps`/`#docs`/`.counter`/`.ticks`）。
3. 无统一布局/导航/登出；页面内联样式遍地。
4. 路由守卫仅判 localStorage，未校验 token 有效性；无 401 自动刷新。
5. 交互粗糙：错误用 red 文本、加载无 spinner、`alert()` 弹结果。
6. `SonglistInput` 仅显示前 5 首；`QrLogin` 无过期刷新。

## 目标目录结构

```
src/
  main.tsx
  App.tsx                  # 路由 + 守卫 + ErrorBoundary
  index.css                # 设计 token + reset（删脚手架残留）
  api.ts                   # axios 实例 + 拦截器 + 类型化 API
  types.ts                 # 共享类型
  lib/
    auth.ts                # token 存取 + isLoggedIn
    qq.ts                  # credential 存取
  hooks/
    useAuth.ts             # 当前用户 + 登出
    useClassify.ts         # 分类工作台状态机
  components/
    AppLayout.tsx          # 顶栏 + Outlet
    Button.tsx, Input.tsx, Card.tsx, Spinner.tsx, ErrorBanner.tsx
    ProtectedRoute.tsx
    SongRow.tsx
  pages/
    Login.tsx, Register.tsx, QrLogin.tsx
    SonglistInput.tsx
    ClassifyWorkbench.tsx
```

## 阶段划分

### 阶段 1：基础清理 + 设计系统
- 删 `index.css`/`App.css` 脚手架残留；`index.html` 修 title/lang。
- 重写 `index.css`：reset + token（颜色/间距/圆角/阴影）+ 暗色适配。
- 建 `components/`：Button、Input、Card、Spinner、ErrorBanner（纯 CSS class，无内联样式）。
- **验收**：`pnpm lint` 通过、`pnpm build` 通过、dev 不报错、旧页面不破。

### 阶段 2：统一布局 + 路由守卫 + 拦截器
- `AppLayout`：顶栏（logo + 用户邮箱 + 登出按钮）+ `<Outlet/>`。
- `ProtectedRoute`：基于 `authApi.me()` 校验，失败跳登录。
- axios 响应拦截器：401 → 尝试 refresh → 重放原请求；失败则清 token 跳登录。
- `ErrorBoundary` 包裹路由。
- `useAuth` hook。
- **验收**：登出可用、401 自动刷新链路通、边界错误不白屏、lint/build 通过。

### 阶段 3：Auth 三页重构
- Login/Register：卡片式布局、表单校验（邮箱格式、密码 8-64）、加载/错误态。
- QrLogin：二维码展示 + 状态文案 + 过期自动刷新 + 重新获取按钮。
- 统一用新组件，去掉内联样式。
- **验收**：三页交互完整、lint/build 通过。

### 阶段 4：SonglistInput 重构
- 完整歌曲列表（可滚动，不引入虚拟列表）、空态、加载态、错误态。
- 双入口清晰化：粘贴链接 / 去扫码取"我喜欢"。
- **验收**：能查看全部歌曲、lint/build 通过。

### 阶段 5：ClassifyWorkbench 重构（核心）
- dnd-kit 跨分类拖拽：歌曲卡可从 A 类拖到 B 类，本地维护拖拽结果。
- 多轮流程：提议展示 → 用户拖拽+文本反馈 → 提交（`feedback_drag` + `feedback_text`）→ AI 重分类 → … → 确认。
- 轮次显示（第 N 轮 / 最多 5 轮）；到达上限禁用反馈。
- 确认结果用面板展示（替代 `alert`）。
- `useClassify` hook 抽状态。
- **验收**：拖拽可用、反馈回传、确认建歌单结果可读、lint/build 通过。

### 阶段 6：收尾
- `api.ts` 响应类型化（消除 `unknown`）。
- 全量 `pnpm lint` + `pnpm build`。
- 全流程手测路径走通（登录→选歌单→分类→拖拽反馈→确认）。
- **验收**：lint/build 通过、无回归。

## 执行方式
subagent-driven：每阶段独立完成后自检（lint + build），通过即 commit（排除 `docs/superpowers/`），自动推进下一阶段。
