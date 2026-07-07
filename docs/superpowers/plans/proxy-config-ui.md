# AI 代理配置 UI 方案

## 1. 背景与根因

`classify_task` 调 `ai_provider.chat` → openai SDK 访问 `api.openai.com` 报
`Connection error.`。排查确认:

- 宿主机有代理 `https_proxy=http://127.0.0.1:7897`(Clash 之类)。
- **worker 容器无代理环境变量**,且容器内 `127.0.0.1` 指向容器自身,无法走宿主机代理。
- 结果:worker 直连 OpenAI → `Network is unreachable` → 分类跑不完 → 提议出不来。

与前端重构无关(重构未碰后端/AI 代码)。本方案用**可视化 UI** 让超管在页面配置代理,替代手改 `.env`/`docker-compose.yml`。

## 2. 目标

- 超管在 `/settings` 页面填代理 `host`+`port`(+可选用户名/密码),点"测试"验证三档连通,保存后 worker 调 AI 走代理。
- **热生效**:改完不重启 worker。
- **不暴露**给终端用户;**不打印**代理密码。

## 3. 总体设计

```
超管浏览器 ──HTTP──▶ backend /api/settings/proxy{,/test}
                          │  读写 DB proxy_config 表
                          │  test: TCP + httpx + openai chat 三档
                          ▼
                    SQLite proxy_config (单行,id=1)
                          │
worker (celery) ──读──▶ proxy_config ──▶ ai_provider.chat
                          │  enabled 时构造 httpx.Client(proxy=...)
                          ▼
                    OpenAI/Anthropic SDK(http_client=...)
                          │
                    api.openai.com (经代理)
```

- 代理配置存 DB(不存 `.env`),页面可改、热生效。
- 仅超管(`User.is_superuser=True`)可访问。
- worker/backend 容器加 `extra_hosts: host.docker.internal:host-gateway`,页面提示填 `host.docker.internal`。

## 4. 后端详细

### 4.1 DB 模型(新建)

`backend/app/models/proxy_config.py`:

```python
class ProxyConfig(Base):
    __tablename__ = "proxy_config"
    id: Mapped[int] = mapped_column(primary_key=True)  # 固定 = 1,单行
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    host: Mapped[str] = mapped_column(String(255), default="")
    port: Mapped[int] = mapped_column(Integer, default=0)
    username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_enc: Mapped[str | None] = mapped_column(Text, nullable=True)  # Fernet
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
```

- `backend/app/models/__init__.py` 加导出 `ProxyConfig`。
- `db/base.py` 的 `init_db()` 加 `from app.models import ProxyConfig  # noqa: F401`(让 `create_all` 建表;新表无需迁移)。
- 密码加密复用 `app/security/crypto.py` 的 `encrypt()/decrypt()`(Fernet 复用 `secret_key`,与 `qq_credential_enc` 同款)。

### 4.2 AI provider 改造

`backend/app/ai/provider.py`:

- `chat()` 每次调用前从 DB 读 `ProxyConfig`(用 `SessionLocal()`)。
- `enabled` 且 `host`/`port` 有效时,构造代理 URL
  `http://[user:pass@]host:port`,建 `httpx.Client(proxy=url)`,传给
  `OpenAI(http_client=...)` / `Anthropic(http_client=...)`。
- **不缓存 `_client`**(每次构造,保证热生效;AI 调用本身慢,构造开销可忽略)。
- `enabled=False` 或字段无效 → 不带 `http_client`(恢复直连)。
- 实现时确认 httpx 版本的 proxy 参数名(httpx≥0.26 用 `proxy=`,旧版 `proxies=`);openai/anthropic SDK 的 `http_client` 接受同步 `httpx.Client`。

### 4.3 依赖:超管守卫

`backend/app/auth/deps.py` 新增:

```python
def get_superadmin(current: User = Depends(get_current_user)) -> User:
    if not current.is_superuser:
        raise HTTPException(status_code=403, detail="Superadmin only")
    return current
```

### 4.4 Schema

`backend/app/schemas/auth.py`:`UserResponse` 加 `is_superuser: bool`(前端靠它显示入口)。

新建 `backend/app/schemas/settings.py`:

```python
class ProxyConfigResponse(BaseModel):
    enabled: bool
    host: str
    port: int
    username: str | None
    password_is_set: bool  # 不返回明文
    model_config = {"from_attributes": True}

class ProxyConfigUpdate(BaseModel):
    enabled: bool
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(ge=1, le=65535)
    username: str | None = None
    password: str | None = None  # None/缺省=不改;""=清空;非空=更新

class ProxyTestRequest(BaseModel):
    enabled: bool = True
    host: str
    port: int
    username: str | None = None
    password: str | None = None  # None=用已存的;""=无密码;非空=用此值

class ProxyTestStepResult(BaseModel):
    ok: bool
    detail: str

class ProxyTestResponse(BaseModel):
    l1_tcp: ProxyTestStepResult
    l2_http: ProxyTestStepResult
    l3_chat: ProxyTestStepResult
```

### 4.5 API 路由

新建 `backend/app/api/settings.py`,前缀 `/api/settings`:

- `GET /proxy` → `ProxyConfigResponse`(超管)。库无记录时返回默认(`enabled=False`,空)。
- `PUT /proxy` body `ProxyConfigUpdate` → `ProxyConfigResponse`(超管)。
  - `password` 语义:`None`/缺省=保留旧值;`""`=清空;非空=`encrypt()` 后存。
  - upsert 单行记录(`id=1`)。
- `POST /proxy/test` body `ProxyTestRequest` → `ProxyTestResponse`(超管)。
  - **L1 TCP**:`socket.create_connection((host, port), timeout=5)`;失败→L2/L3 标 `skipped`。
  - **L2 HTTP**:`httpx.Client(proxy=url).get(ai_base_url 或 https://api.openai.com, timeout=10)`;不抛(任意 HTTP 响应,含 401/404)即 `ok`。
  - **L3 chat**:`OpenAI(api_key, base_url, http_client=httpx.Client(proxy=url)).chat.completions.create(model, messages=[{role:user,content:"ping"}], max_tokens=1)`;返回非空即 `ok`。
  - 每档 `detail` 中文描述(如"TCP 连接成功"/"Connection refused")。
- `main.py` 挂载:`app.include_router(settings.router, prefix="/api/settings")`。

### 4.6 限流

超管接口复用全局 `IPRateLimitMiddleware`(超管自用,不额外加用户级限流)。

## 5. 前端详细

### 5.1 类型

`frontend/src/types.ts`:`User` 加 `is_superuser: boolean`;新增 `ProxyConfig`/`ProxyTestResult` 类型。

### 5.2 API client

`frontend/src/api.ts` 新增 `settingsApi`:

```typescript
export const settingsApi = {
  getProxy: () => api.get<ProxyConfig>("/settings/proxy"),
  saveProxy: (data: ProxyConfigUpdate) => api.put<ProxyConfig>("/settings/proxy", data),
  testProxy: (data: ProxyTestRequest) => api.post<ProxyTestResult>("/settings/proxy/test", data),
};
```

### 5.3 queries

`frontend/src/hooks/queries.ts` 新增:

- `useProxyConfig()`:`useQuery(["settings","proxy"], settingsApi.getProxy)`。
- `useSaveProxy()`:`useMutation` PUT,成功 toast + invalidate。
- `useTestProxy()`:`useMutation` POST,返回三档结果供页面展示。

### 5.4 页面

新建 `frontend/src/pages/Settings.tsx`:

- `Card`(标题"AI 代理配置"):
  - 启用开关(`Checkbox` 或 shadcn Switch;现有 ui 无 Switch,用 Checkbox)。
  - `Input` host(placeholder `host.docker.internal`)、port(placeholder `7897`)。
  - `Input` username(可选)、`Input type=password` password(可选;已存时 placeholder"已设置,留空不改")。
  - 提示框(黄色):"若 TuneSet 跑在 Docker,host 填 `host.docker.internal` 或宿主机 IP,**不要填 127.0.0.1**(容器内 127.0.0.1 指容器自身)。"
  - 按钮:`测试`(调 test,显示三档 ✓/✗ + detail)、`保存`(调 PUT)。
  - 测试结果区:三行(L1 TCP / L2 HTTP / L3 Chat),每行图标+detail。
- 用现有 ui:`Card/Input/Button/Label`。lucide 图标:`Settings`(齿轮,入口)、`CircleCheck`/`CircleX`(测试结果)。

### 5.5 路由 + 入口

- `App.tsx`:在 `ProtectedRoute`+`AppLayout` 下加
  `<Route path="/settings" element={<AdminRoute><Settings/></AdminRoute>} />`。
- 新建 `frontend/src/components/AdminRoute.tsx`:基于 `ProtectedRoute` 逻辑 + `user.is_superuser` 检查;非超管 `<Navigate to="/songlist" replace />`。
- `AppLayout.tsx` 顶部栏:若 `user.is_superuser`,显示齿轮图标 link `/settings`(仅超管可见入口)。

## 6. Docker 改动

`docker-compose.yml`:`backend`/`worker` 加

```yaml
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

(beat 不调 AI,不加;frontend 不需要。)image 标签 4 处 `0.5.8` → `0.6.0`。

## 7. 安全

- 代理密码 `encrypt()` 存 DB;`GET` 只返回 `password_is_set: bool`,不返回明文。
- 仅超管可访问(403 普通用户);`AdminRoute` 前端兜底。
- 测试接口不打印密码/host 之外的敏感信息。

## 8. 日志

`loguru` 单行,`event` 英文 snake_case,描述中文:

- `proxy_config_save`(INFO):`user_id`、`enabled`、`host`、`port`(不记密码)。
- `proxy_config_test`(INFO):`user_id`、`l1_ok`、`l2_ok`、`l3_ok`。
- 测试某档失败:`proxy_config_test`(WARNING)带 `detail`。

## 9. 版本

- `feat`(AI 代理配置 UI)→ minor → `0.5.8` → `0.6.0`。
- 同步:`VERSION`、`backend/pyproject.toml`、`frontend/package.json`、`docker-compose.yml` 4 处 image 标签。
- `docs/CHANGELOG.md` 追加。
- 独立 commit `chore(release): v0.6.0` + tag `v0.6.0`。

## 10. 实施步骤(subagent-driven,单代理顺序)

1. **后端 DB**:新建 `ProxyConfig` model + `__init__` 导出 + `init_db` import → verify:启动建表,`sqlite3` 见 `proxy_config` 表。
2. **后端 provider 改造**:读 DB + 注入 `http_client` + 不缓存 → verify:mock DB enabled,确认 `OpenAI` 收到 `http_client`。
2.5. **修 classify_task bug**:`classify_task` 成功后 publish `awaiting_feedback`;失败时 `update_state(status=failed, error)` + publish failed;`ClassifyState` 加 `error` 字段 → verify:单批分类 SSE 收到 ready;AI 失败后重连 SSE/GET state 见 failed。
3. **后端 API**:`schemas/settings.py` + `auth/deps.get_superadmin` + `api/settings.py` + `main.py` 挂载 + `UserResponse.is_superuser` → verify:超管 curl `GET/PUT/POST /test` 三档,普通用户 403。
4. **前端类型 + api + queries**:`types.ts` + `api.ts settingsApi` + `queries.ts` 三个 hook → verify:`tsc` 通过。
5. **前端页面 + 路由 + 入口**:`Settings.tsx` + `AdminRoute.tsx` + `App.tsx` 路由 + `AppLayout` 齿轮入口 → verify:超管登录见齿轮,普通用户不可见。
6. **Docker**:`compose` 加 `extra_hosts` + image 标签 `0.6.0` → verify:`docker compose config` 无误。
7. **联调**:超管填 `host.docker.internal:7897`,测试三档全绿,保存 → worker 调 AI 走代理 → 分类出提议(SSE 推 ready,前端显示)。⚠️ 依赖附带 bug(见 §12)是否修。
8. **lint/typecheck/build** → verify:全通过。
9. **发版**:`0.6.0` 同步 + CHANGELOG + commit + tag。

## 11. 风险与边界

- **httpx proxy 参数名**:≥0.26 用 `proxy=`,旧版 `proxies=`。实现时 `grep httpx backend/uv.lock` 确认。
- **openai/anthropic SDK `http_client`**:确认版本接受同步 `httpx.Client`。
- **DB 读开销**:每次 AI 调用读一次 `proxy_config`(可接受);若虑性能,加进程内 TTL 缓存(5s)+ `updated_at` 失效。本方案先不缓存(简单+立即生效)。
- **worker prefork 多进程**:各进程独立读 DB,无共享问题。
- **测试 L3 消耗 token**:超管自测,`max_tokens=1`,成本可忽略。
- **代理不通时 AI 超时**:现有 provider 未设 timeout,可能长时间挂;本方案不涉及(后续可加 `timeout=` 优化)。
- **`host.docker.internal` 跨平台**:WSL2/Linux Docker 需 `extra_hosts: host-gateway`(本方案已加)。

## 12. 附带 bug 修复(陛下选 a,本方案一并修)

排查代理问题时发现 `backend/app/tasks/classify_task.py` 两个 bug(代理通后会暴露):

1. **成功后未 publish `awaiting_feedback`**(单批场景;多批 `merge_node` 已 publish,nodes.py:145-148)→ SSE 实时订阅收不到 `classify_ready` → 前端不切提议态。
   - 真相:`batch_propose_node` 单批时(nodes.py:134-139)只 publish `running` 进度,未 publish `awaiting_feedback`;`classify_task` 成功后也未兜底 publish。
   - 修法:`classify_task` 成功后统一 publish `awaiting_feedback` + proposal + iteration(兜底,覆盖单批 + 竞态;merge_node 的 publish 保留,实时性好)。
2. **失败时未 `graph.update_state`** → 重连/`GET state` 读不到 `failed` → 看不到失败。
   - 真相:`classify_task` 失败时只 publish+raise(classify_task.py:26-31),state 未更新;`ClassifyState` 无 `error` 字段。
   - 修法:`ClassifyState` 加 `error: str` 字段;`classify_task` 失败时 `graph.update_state(config, {"status":"failed","error":str(e)})` + publish failed + raise。

`classify_resume_task`(refine/finalize)不改:feedback 端点同步 `.get(timeout=120)` 返回,前端靠 HTTP 响应更新(queries.ts:100-106),不依赖 SSE。

## 13. 验收标准

- [ ] 超管登录后顶部栏见齿轮入口;普通用户不可见(`is_superuser=False` 时无入口,直访 `/settings` 被 `AdminRoute` 弹回)。
- [ ] `/settings` 填 `host.docker.internal:7897`,点"测试"显示 L1/L2/L3 三档结果(通则绿,不通则红+detail)。
- [ ] 保存后 `GET` 返回配置(密码字段为 `password_is_set: true`,无明文)。
- [ ] worker 调 AI 走代理:日志见 AI 调用成功(无 `Connection error`),分类任务产生提议。
- [ ] `enabled=false` 保存后,worker 恢复直连(被墙则失败,符合预期)。
- [ ] 后端日志:密码不出现;`proxy_config_save/test` 事件正常。
- [ ] `lint`/`tsc`/`vite build` 全通过。
- [ ] 版本 `0.6.0`,tag `v0.6.0`,CHANGELOG 已追加。
- [ ] 单批分类 SSE 实时收到 `classify_ready`;AI 失败后重连 SSE/`GET /{thread_id}` 见 `status=failed`+`error`。
