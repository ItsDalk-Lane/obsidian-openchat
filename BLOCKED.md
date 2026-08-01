# BLOCKED.md（待裁决清单）

## 0A. `app/` 整体删除与只读测试全绿互相冲突

- 完成条件要求 `app/` 整体删除，且禁止修改、删除或跳过任何 `.test.mjs`。
- 精确复核为 6 个测试文件、13 处路径、11 个旧路由、8 个测试用例：10 次 `readFile(new URL("../app/api/..."))` 源码读取和 3 次 `jiti.import("../app/api/...")` 运行时导入。
- 一旦物理删除 `app/`，预计在现有具名两项之外至少新增 8 个失败；保留永久兼容目录或链接又不满足“`app/` 整体删除”。路径别名、包导出和模块加载器也拦不住真实文件读取。
- 11 个对应实现均已迁到 `server/api`；干净解法是仅把这 6 个测试中的 13 个路径改指向 `server/api`，但这违反测试只读边界。次选的测试期临时链接会改变验收生命周期，同样未经授权。
- 影响判断：任务 1、任务 2、任务 3 的启动与打包切换仍可继续；最终删除动作和删除后的 `npm run check` 暂无法同时达成，不会用假输出或放宽测试掩盖。

## 0B. 根目录 Next.js 专属文件不在可修改白名单

- `instrumentation.ts`、`proxy.ts`、`next-env.d.ts`、`next.config.ts` 都在 `app/` 外，且不属于任务书列出的可修改路径。
- 其中启动恢复与网络请求行为、API 请求防护、版本注入已分别迁到 `server/` 与 Vite 配置；但文件本身不能合规删除。
- 移除 Next 依赖后，`next-env.d.ts` 若仍被类型检查包含会引用不存在的类型；可在允许修改的 `tsconfig*` 中排除，但最终仓库仍残留 Next 专属文件，与“Next.js 完全退场”的字面要求冲突。
- 影响判断：不阻塞新栈运行、打包和依赖移除；阻塞“仓库无 Next 专属残留”的声明，未获授权前不删除这些根文件。

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
