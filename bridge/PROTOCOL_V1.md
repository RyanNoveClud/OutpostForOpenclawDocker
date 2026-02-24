# Outpost ↔ OpenClaw Bridge Protocol V1

## Task envelope
```json
{
  "taskId": "string",
  "kind": "install|run|result|log",
  "source": "outpost|openclaw",
  "payload": {}
}
```

## Implemented in this phase
- `install`: Outpost 调用 Clawhub 安装技能并写入 registry
- `run`: 支持 `outpost-shell` / `outpost-browser` / `openclaw-plan` 执行
- `result`: 支持 OpenClaw 回传结果到 task 状态
- `task state`: `bridge/tasks.json` 持久化
- `log`: task-log jsonl 持久化
- `security`: run/result 支持 `OUTPOST_BRIDGE_SIGNATURE` 签名校验

## API
- `GET /api/bridge/registry`
- `GET /api/bridge/task-log?limit=100`
- `POST /api/bridge/install`
  - body: `{ "slug": "skill-slug", "version": "optional", "force": true }`
- `POST /api/bridge/run`
  - body: `{ "runner": "outpost-shell|outpost-browser", ...payload }`
- `POST /api/bridge/result`
  - body: `{ "taskId": "...", "status": "done|error", "result": {}, "error": null }`
- `GET /api/bridge/task/:taskId`

## Orchestrator Loop (new)
- OpenClaw 侧可使用 `bridge/orchestrator-client.js` 调用 run/result/task 接口。
- 循环模式脚本：`bridge/orchestrator-loop.mjs`
  - 从 `bridge/orchestrator-queue.json` 取任务（queued/retry_wait）
  - 调用 `POST /api/bridge/run`
  - 回写 `POST /api/bridge/result`
  - 失败指数退避重试（默认最多 2 次）
- 入队脚本：`bridge/orchestrator-enqueue.mjs`
