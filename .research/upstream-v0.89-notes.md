# Upstream `v0.8.9` Release Notes

> **Note on naming**: There is no upstream `v0.89.0` release (HTTP 404 from `/releases/tags/v0.89.0`). The user's request "from v0.88.x to v0.89" maps to the upstream **`v0.8.8 → v0.8.9`** jump. These are the notes for the tag the user almost certainly meant.

- Source: `GET https://api.github.com/repos/agegr/pi-web/releases/latest` (also reachable as `/releases/tags/v0.8.9`, release id `371083814`).
- Published: `2026-08-15T15:31:30Z`.
- Body is bilingual (Chinese first, English second); both sections are reproduced verbatim below.

---

## 中文

基于 `v0.8.8..v0.8.9` 的提交整理。

### 修复

- 工具调用参数流式传输期间即可显示工具调用，并补充工具执行进度反馈（`77e482d`、`b9bb1d9`）。
- 拒绝存在歧义的裸模型作用域，避免错误匹配模型（`06522eb`）。
- 保持 Markdown 表格源码标记内联，修复表格内容处理问题（`7473ac6`，#460）。
- 加强模型提供商响应校验，防止异常响应影响配置界面（`586d72e`）。
- 将包装进程的关闭信号转发给 Next.js 子进程，并限制关闭等待时间（`7152653`，#502）。
- 统一 Windows 项目标识的路径规范化，修复项目与工作树识别（`fa32336`，#490）。
- 隔离项目命令环境，清理宿主侧 `PORT`、`NODE_ENV` 和 `NEXT_*` 变量，同时保留 SDK 与扩展覆盖行为（`5d07375`，#487）。
- 统一聊天通知的居中与桌面聊天列对齐（`fb8e295`，#491）。

### 改进

- 升级存在安全风险的依赖（`af0b592`）。
- 将 Pi 相关依赖升级至 `0.84.2`（`febcba5`）。

### 内部调整

- 发布 npm 包 `@agegr/pi-web@0.8.9`（`2a6e537`）。

## English

Prepared from commits in `v0.8.8..v0.8.9`.

### Fixed

- Show tool calls while their arguments are streaming, with tool execution progress feedback (`77e482d`, `b9bb1d9`).
- Reject ambiguous bare model scopes to prevent incorrect model matches (`06522eb`).
- Keep Markdown table source tokens inline to correct table content handling (`7473ac6`, #460).
- Guard model provider responses so malformed responses do not disrupt the configuration UI (`586d72e`).
- Forward wrapper shutdown signals to the Next.js child process and bound the shutdown wait (`7152653`, #502).
- Normalize Windows project identity paths for correct project and worktree detection (`fa32336`, #490).
- Isolate project command environments by removing host-only `PORT`, `NODE_ENV`, and `NEXT_*` variables while preserving SDK and extension overrides (`5d07375`, #487).
- Center chat notices consistently and align them with the desktop chat column (`fb8e295`, #491).

### Improved

- Updated dependencies with known security issues (`af0b592`).
- Upgraded Pi dependencies to `0.84.2` (`febcba5`).

### Internal

- Published npm package `@agegr/pi-web@0.8.9` (`2a6e537`).