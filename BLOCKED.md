# BLOCKED.md（待裁决清单）

## 0. 本次迁移开工时没有任务书所述未提交改动

- 任务书现状称工作树有大量未提交改动，要求开工先原样 `git add -A && git commit` 保住。
- 实测 `git status --short`、`git diff --stat`、`git diff --cached --stat` 均无输出；起点是 `main@56311cd`，与 `origin/main` 一致。
- 因没有内容可保护，未制造空提交；直接从该提交创建 `refactor/vite-foundation`。
- 影响判断：不影响四条基线、67 条路由盘点或后续迁移，可继续全部技术工作；最终提交序列会比任务书少一个“任务 0 保住提交”。

## 1. 基线行数描述偏差

- 任务书：`lib/mcp-extension.ts` 共 99 行。
- 实测命令：`wc -l lib/mcp-extension.ts`
- 实测输出：`98 lib/mcp-extension.ts`
- 影响判断：文件内容与任务书描述的解析、兜底、警告、global/project 去重机制一致；该偏差看起来只是不影响行为的行数差异。依照“只做不受影响的部分”，继续依赖安装和基于已核实机制的通用化；若后续发现行为差异，立即停止相关工作。

## 2. `PROGRESS.md` 与既有 `progress.md` 路径冲突

- `git ls-tree -r --name-only HEAD` 显示仓库已有受版本控制的 `progress.md`。
- 当前 macOS 文件系统大小写不敏感，`git config --get core.ignorecase` 输出 `true`；因此任务书要求的新建 `PROGRESS.md` 会覆盖既有 `progress.md`，Git 仍显示小写路径。
- 已确认任务开始前工作区干净，误覆盖完全由本任务造成；先恢复原文件，再把本任务进度追加到同一逻辑文件，保留历史内容。
- 待裁决：最终 `git diff main --stat` 会显示 `progress.md`，但在当前文件系统上它与白名单中的 `PROGRESS.md` 是同一路径，无法同时存在。
