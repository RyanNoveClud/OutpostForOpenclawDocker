# Outpost for OpenClaw Docker

Outpost 是运行在**宿主机**上的中介服务，用来把 OpenClaw（Docker/隔离环境）缺少的宿主机能力补齐：

- 浏览器自动化（Playwright）
- Web 控制台（Chat / Dashboard / Logs / 任务列表 / Skills / Settings）
- OpenClaw Chat Relay（Outpost 仅转发，不伪造最终回答）
- Skills 桥接（通过 ClawHub 安装/更新/运行）
- 可选 Shell / Update 能力（默认关闭）

> 当前版本：`0.10.3`

---

## 1. 架构与端口

- 前端开发端口（Vite）：`5173`
- Outpost API 服务端口（Express）：`8787`
- 开发态访问：`http://<host>:5173`
- 生产态访问：静态文件 + API 同进程

Vite 会将 `/api/*` 代理到 `http://127.0.0.1:8787`（可通过 `VITE_API_PROXY_TARGET` 覆盖）。

---

## 2. 快速启动

### 2.1 依赖

- Node.js `>=22`
- npm `>=10`
- Playwright 浏览器依赖

```bash
cd /home/node/.openclaw/workspace/outpost
npm install
npx playwright install chrome
```

### 2.2 启动 API（8787）

```bash
npm start
```

### 2.3 启动前端开发（5173）

```bash
npm run dev
```

---

## 3. 环境变量（.env）

Outpost 启动时会自动读取 `outpost/.env`。

```env
# API 鉴权（可选）
OUTPOST_TOKEN=

# 能力开关（默认 false）
OUTPOST_ALLOW_SHELL=true
OUTPOST_ALLOW_UPDATE=true
OUTPOST_ALLOW_SKILLS=true

# Chat Relay -> OpenClaw Gateway
OUTPOST_OPENCLAW_CHAT_URL=http://127.0.0.1:18789/v1/chat/completions
OUTPOST_OPENCLAW_CHAT_TOKEN=

# 工作目录
OUTPOST_WORKSPACE=/home/node/.openclaw/workspace
OUTPOST_SKILLS_DIR=/home/node/.openclaw/workspace/outpost/skills

# 可选：更新后如何重启 Outpost（不填则 process.exit，交给 supervisor 拉起）
OUTPOST_RESTART_CMD=
```

---

## 4. 关键能力说明

## 4.1 Chat Relay

- 路由：`POST /api/web/chat/stream`
- 行为：把用户消息转发到 OpenClaw `/v1/chat/completions`
- Outpost 只做 relay，不作为最终回答者

## 4.2 任务列表（Tasks）

统一聚合：
- 本地 bridge 任务（install/run/chat-run）
- OpenClaw cron 任务（jobs/runs）
- channel 来源任务（telegram / feishu / napcat）

路由：`GET /api/web/tasks/overview`

包含：
- 运行中/已完成/失败
- 来源归因（`openclaw-chat` / `outpost-ui` / `channel:*` / `openclaw-cron`）
- 阶段（stage）与进度（progressPercent）

## 4.3 更新与自动重启

- 新路由：`POST /api/web/system/update`
- 兼容旧路由：`POST /api/update`
- 默认更新脚本：`scripts/auto-update.sh`
- 设置页可填自定义脚本命令

> 注意：脚本路径必须是 **Outpost 运行机器可见路径**。如果 Outpost 跑在 Linux，`/Users/...` 这种 macOS 路径不可用。

---

## 5. API 一览

### 基础

- `GET /api/health`
- `GET /api/capabilities`
- `GET /api/web/topbar`

### Web Console

- `GET /api/chat/sessions`
- `POST /api/web/chat/stream`
- `GET /api/web/dashboard/metrics`
- `GET /api/web/dashboard/events`
- `GET /api/web/tasks/overview`
- `GET /api/web/bridge/tasks`
- `GET /api/web/bridge/task-log`

### Skills

- `GET /api/web/skills`
- `POST /api/web/skills/search`
- `POST /api/web/skills/install`
- `POST /api/web/skills/refresh`
- `POST /api/web/skills/action`
- `POST /api/web/skills/run`

### 浏览器控制

- `POST /api/web-control/command`
- `POST /api/command`
- `POST /api/batch`

### 高风险能力（受开关控制）

- `POST /api/shell`（`OUTPOST_ALLOW_SHELL=true`）
- `POST /api/update` / `POST /api/web/system/update`（`OUTPOST_ALLOW_UPDATE=true`）

---

## 6. 缓存与日志落盘

Outpost 会在 `outpost/bridge` 和 `outpost/logs` 保留可观测数据：

- Chat 历史：`outpost/bridge/chat-sessions.json`
- 任务状态：`outpost/bridge/tasks.json`
- 任务日志：`outpost/bridge/task-log.jsonl`
- 操作日志：`outpost/bridge/web-actions.jsonl`
- 运行日志：`outpost/logs/demo.log`

---

## 7. 常见问题

## 7.1 更新时报 `Failed to fetch`

优先检查：
1. 前端和后端是否同版本并已重启
2. `/api/web/system/update` 是否存在（旧版仅有 `/api/update`）
3. 脚本路径是否对当前运行环境可见
4. 是否启用 `OUTPOST_ALLOW_UPDATE=true`

## 7.2 版本号不一致（0.9.0 / 0.10.3）

版本展示读取 `outpost/package.json`。确保该文件版本与部署产物一致后重启服务。

---

## 8. 开发与测试

```bash
npm run build
npm run test
npm run lint
```

---

## 9. 发布到 GitHub（建议流程）

```bash
cd /home/node/.openclaw/workspace/outpost

# 1) 检查改动
git status

# 2) 提交
git add .
git commit -m "docs: refresh README and deployment guide"

# 3) 关联远端
git remote add origin https://github.com/deathangel849/OutpostForOpenclawDocker.git

# 4) 推送
git branch -M main
git push -u origin main
```

如果远端已存在 `origin`，先执行：

```bash
git remote set-url origin https://github.com/deathangel849/OutpostForOpenclawDocker.git
```

---

## 10. 安全建议

- 不要把 token、`.env`、日志、缓存文件提交到公网仓库
- 对外发布前先做一次敏感信息扫描
- `OUTPOST_ALLOW_SHELL/UPDATE` 仅在受控环境开启
