# BLOCKED.md（偏差与裁决记录）

## 主界面视觉深化（2026-08-01）

当前状态：无未解决阻塞。

### 已处置 V0. 开工分支不存在

- 任务书现状称当前应在 `refactor/vite-foundation`，并要求全部提交留在该分支、不得改动 `main`。
- 开工实测 `git status --short --branch` 为 `## main...origin/main`，`HEAD` 是 `c245f3d42dcf2bac502a5fbb94e0cd04794f1a07`；`git show-ref --verify refs/heads/refactor/vite-foundation` 报 `not a valid ref`，远端也只有 `origin/main`。
- 工作树干净，当前提交正是 Vite 地基收口提交。为避免后续改动落入 `main`，已从该提交执行 `git switch -c refactor/vite-foundation`；没有改写 `main`，后续按任务书继续。

当前状态：无未解决阻塞。下列 0A、0B 已由用户在 2026-08-01 明确扩展白名单后解决，其余条目是开工实测与任务书的历史偏差，均未阻止交付。

## 已解决 0A. `app/` 整体删除与只读测试全绿互相冲突

- 用户已授权只修改下述 6 个测试文件中的 13 条旧路由路径；现已逐条改为对应的 `server/api` 路径，没有第 14 条或其他测试改动。
- `app/` 已整体删除；删除后的完整测试仍为 280 项、278 过、仅原有两项具名失败、0 跳过、0 todo，因此没有新增失败。

- 完成条件要求 `app/` 整体删除，且禁止修改、删除或跳过任何 `.test.mjs`。
- 精确复核为 6 个测试文件、13 处路径、11 个旧路由、8 个测试用例：10 次 `readFile(new URL("../app/api/..."))` 源码读取和 3 次 `jiti.import("../app/api/...")` 运行时导入。
- 一旦物理删除 `app/`，预计在现有具名两项之外至少新增 8 个失败；保留永久兼容目录或链接又不满足“`app/` 整体删除”。路径别名、包导出和模块加载器也拦不住真实文件读取。
- 11 个对应实现均已迁到 `server/api`；干净解法是仅把这 6 个测试中的 13 个路径改指向 `server/api`，但这违反测试只读边界。次选的测试期临时链接会改变验收生命周期，同样未经授权。
- 影响判断：任务 1、任务 2、任务 3 的启动与打包切换仍可继续；最终删除动作和删除后的 `npm run check` 暂无法同时达成，不会用假输出或放宽测试掩盖。
- 历史裁决点：第 3 个连续 goal turn 时曾需要二选一授权；用户随后选择了“只改 13 条测试路径后删除 `app/`”，本项已关闭。

## 已解决 0B. 根目录 Next.js 专属文件不在可修改白名单

- 用户已明确授权删除这 4 个根文件；`instrumentation.ts`、`proxy.ts`、`next-env.d.ts`、`next.config.ts` 当前均不存在。

- `instrumentation.ts`、`proxy.ts`、`next-env.d.ts`、`next.config.ts` 都在 `app/` 外，且不属于任务书列出的可修改路径。
- 其中启动恢复与网络请求行为、API 请求防护、版本注入已分别迁到 `server/` 与 Vite 配置；但文件本身不能合规删除。
- 移除 Next 依赖后，`next-env.d.ts` 若仍被类型检查包含会引用不存在的类型；可在允许修改的 `tsconfig*` 中排除，但最终仓库仍残留 Next 专属文件，与“Next.js 完全退场”的字面要求冲突。
- 影响判断：运行行为均已迁入独立服务或 Vite 配置，最终包内也不存在这些路径，本项已关闭。

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
