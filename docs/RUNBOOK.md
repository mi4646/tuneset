# 运维手册

## 部署流程

### 首次部署

```bash
git clone <repo> /var/www/tuneset && cd /var/www/tuneset
cp backend/.env.example backend/.env
# 编辑 .env：至少改 SECRET_KEY / AI_API_KEY / SUPERADMIN_PASSWORD
docker compose up -d --build
```

服务组成（`docker-compose.yml`）：

- `redis`：redis-stack-server（含 RedisJSON+RediSearch，LangGraph RedisSaver 依赖）
- `backend`：FastAPI（uvicorn），端口 8000
- `worker`：Celery worker（同一镜像，不同 command）
- `frontend`：nginx 静态托管 SPA，端口 80

### 更新部署

```bash
git pull
docker compose up -d --build backend frontend   # 重建变更的服务
docker compose logs -f backend                  # 观察启动日志
```

后端代码变更必须 rebuild（`backend` 服务无代码挂载卷，仅 `./backend/data:/app/data` 数据卷）：

```bash
docker compose up -d --build backend
```

## 健康检查

| 检查项 | 命令 | 期望 |
|------|------|------|
| 后端存活 | `curl http://localhost:8000/api/health` | 200 |
| 前端存活 | `curl http://localhost/` | 200 |
| Redis 存活 | `docker compose exec redis redis-cli ping` | PONG |
| 容器状态 | `docker compose ps` | 全部 Up |
| Worker 状态 | `docker compose logs --tail=50 worker` | 无报错 |

> 前端端口随 `.env` 的 `FRONTEND_PORT` 变化（默认 80），健康检查命令按实际配置调整。

## 常见问题与修复

### QQ 登录态过期

现象：调 `/api/songlist/favorite` 报 400 `credential 缺少 encrypt_uin，请重新扫码登录`。

修复：前端重新扫码登录。QQ 登录态会话级，服务端不存储，过期需重扫（方案⑤，独立于账号 JWT）。

### AI 限流触发

现象：分类接口返回 429。

修复：检查 `.env` 中 `RATE_LIMIT_USER_DAILY` / `RATE_LIMIT_IP_HOURLY` / `RATE_LIMIT_CLASSIFY_INTERVAL` / `CLASSIFY_MAX_SONGS` / `CLASSIFY_MAX_ITERATIONS`，按需调大或等窗口刷新。AI 成本由开发者承担，限流是硬约束。

### Redis 连接失败

现象：后端启动报 Redis 连接错误，或 LangGraph checkpoint 写入失败。

修复：

1. `docker compose ps redis` 确认 redis 容器 Up
2. 确认 `REDIS_URL=redis://redis:6379/0`（容器内网络名 `redis`）
3. LangGraph RedisSaver 需 RedisJSON+RediSearch，compose 已用 `redis/redis-stack-server:latest`，勿换成普通 redis

### 超管密码修改

改 `backend/.env` 的 `SUPERADMIN_PASSWORD`，重启后端生效（启动时 `ensure_superadmin` 检测哈希变更并更新）。

```bash
docker compose restart backend
```

### 分类任务卡住

现象：`/api/classify/{thread_id}` 长时间不推进。

修复：

1. 查 worker 日志：`docker compose logs --tail=200 worker`
2. 查 AI 配置：`AI_PROTOCOL` / `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` 是否正确
3. 任务上限：`CLASSIFY_MAX_ITERATIONS=5`，达上限后才会 finalize
4. 主动确认路径目前未实现（用户须反馈至上限），见 memory `tuneset-frontend-refactor-todos.md`

## 回滚

### 回滚代码

```bash
git log --oneline -10                       # 找到上一个稳定 commit
git checkout <commit> -- backend frontend   # 回滚代码
docker compose up -d --build backend frontend
```

或硬回滚：

```bash
git reset --hard <commit>
docker compose up -d --build
```

### 回滚数据库

SQLite 文件在 `backend/data/tuneset.db`（compose 挂载 `./backend/data:/app/data`）。定期备份：

```bash
cp backend/data/tuneset.db backend/data/tuneset.db.$(date +%F).bak
```

回滚：停服后用备份覆盖，再启动。

```bash
docker compose stop backend
cp backend/data/tuneset.db.bak backend/data/tuneset.db
docker compose start backend
```
