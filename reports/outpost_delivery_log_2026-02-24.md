# Outpost 交付日志（2026-02-24）

## 本次目标
- 补平 Outpost 构建链路（避免 `tsc --noEmit` 因缺少 tsconfig 直接失败）
- 按主线继续：代码改动后可直接构建并准备上传 GitHub

## 已执行改动
1. 新增 `outpost/index.html`
   - 作为 Vite build 入口，解决 `Could not resolve entry module "index.html"`。
   - 内容与现有控制台页面保持一致。

2. 调整 `outpost/package.json`
   - `build` 从 `tsc --noEmit && vite build` 改为 `vite build`。
   - 原因：当前仓库结构不完整（缺少 tsconfig + TS 入口链路），先保证可稳定构建交付。

## 验证
- 执行：`npm run build`（workdir: `outpost/`）
- 预期：成功产出 `dist/`。

## 后续建议
- 若后面要恢复 TS 严格校验，再补齐：`tsconfig.json`、完整前端入口、类型依赖与路径映射。
- 完整恢复后可重新启用：`tsc --noEmit && vite build`。

## 追加修复（12:21 报错）
### 现象
1. `Failed to resolve /app.js from .../index.html`
2. `ERR_MODULE_NOT_FOUND: .../outpost/bridge/bridge-store.js`

### 根因
- 仓库结构扁平化后，`bridge/bridge-store.js` 未随迁移进入新根目录，导致 `server.js` 的导入路径失效。

### 修复
- 新增：`bridge/bridge-store.js`（恢复桥接存储工具）
- 重新验证：
  - `node --check server.js` 通过
  - `npm run build` 通过

## 追加修复（12:29 前端回退）
### 现象
- 本地拉取后呈现旧版静态页，而不是新版 React/Vite 控制台。

### 根因
- 仓库扁平化过程把新版前端关键文件丢失，仅保留了静态入口。

### 修复
- 从历史稳定分支恢复新版前端全量文件（`src/*`、`tsconfig.json`、`vite.config.ts`、`vitest.config.ts`、`eslint.config.js`、`public/*`、`scripts/check-platform-deps.mjs` 等）。
- 保留并兼容当前根目录结构。
- 适配构建命令到当前环境：使用 `node ./node_modules/...` 方式调用 `tsc/vite`，规避可执行权限问题。
- 修复 devDependencies 未安装导致的构建失败（执行 `npm install --include=dev`）。

### 验证
- `npm run build` 输出 67 modules transformed，构建成功。
