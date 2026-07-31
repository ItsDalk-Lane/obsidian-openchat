# PROGRESS.md

## 精简内置 pi-subagents（2026-07-31）

- [x] 生成并更新 `patches/pi-subagents+0.37.2.patch`，核心改动 4 处全部包含：
 	- 删除 `node_modules/pi-subagents/package.json` 里 `pi.skills` / `pi.prompts` 清单引用。
 	- 删除 `src/extension/index.ts` 中 `registerSlashCommands(pi, state);`。
 	- 删除 `src/watchdog/register-main.ts` 中 `pi.registerCommand("subagents-watchdog", ...)` 命令注册块。
 	- 删除 `node_modules/pi-subagents/agents/` 下 9 个内置 agent 文件（advisor/context-builder/delegate/oracle/planner/researcher/reviewer/scout/worker）。
- [x] pi-web 改动完成：
 	- `package.json` 将 `pi-subagents` 从 `^0.37.2` 锁定为 `0.37.2`。
 	- `components/SubagentsConfig.tsx` 移除「禁用全部内置 agents」设置项与对应禁用逻辑。
- [x] 验证通过：`npx patch-package --reverse && npx patch-package`（两次均应用 `pi-subagents@0.37.2 ✔`）。
- [x] 验证通过：`node_modules/.bin/tsc --noEmit`、`npm run lint`。
- [x] API 验证（30141 端口现有服务）：
 	- `get_tools` 仍包含 `subagent`、`subagent_wait`、`subagent_supervisor`、`intercom`。
 	- `get_commands` 仅剩 6 个 `skill:*` 命令；`run/chain/parallel/subagents*/prompt-workflow/chain-prompts/subagents-watchdog` 全部不存在。
 	- `GET /api/subagents/agents?cwd=...` 返回 `{"agents":[],"diagnostics":[]}`，builtin 分组为空。
 	- 实测主智能体通过 `subagent` 工具完成 `action:list -> action:create -> SINGLE 运行`，子智能体返回 `TEMP_CORE_OK`；随后已执行 `action:delete` 清理临时 agent。

> 注：本文件此前残存另一会话的 8 行规划记录（leader/planning-with-files），与本任务无关，已覆盖。

## 2026-07-28 上游版本差异调研

- [x] 已确认本地基线：`main` / `d4f13d9` / `package.json` 版本 `0.8.2`。
- [x] 已确认本地 `origin` 是用户分叉，后续查询显式使用 `agegr/pi-web`，避免把分叉主分支误当上游。
- [x] 仓库接口和远端对象均确认：上游最新正式版本是 `v0.8.2`，上游 `main` 也停在同一提交 `b6116d10`。
- [x] 已直接比较本地 `d4f13d9` 与上游 `v0.8.2`；用户所说“更新了一个版本”按“上游现已到 v0.8.2”处理。
- [x] 已识别同名标签碰撞：本地 `v0.8.2` 是分叉发布标签，必须按上游提交号取对象后比较。
- [x] 已取得真实提交图和上游版本范围：共同祖先后本地 27 提交、上游 82 提交；`v0.8.1..v0.8.2` 为 29 提交、54 文件。
- [x] 已逐主题核对上游 `v0.8.2` 的 4 项新增、4 类修复和内部依赖变化是否已存在于本地。
- [x] 已确认两个安全主题均未落地：请求主机白名单 / 写接口防御，以及项目资源信任门禁 / 受限模式。
- [x] 已确认跨项目标签页清理、全局技能开关修复缺失；扩展状态已有旧实现但未对齐底栏样式。
- [x] 已确认快速变更总览、删除文件差异和统一状态标记缺失；本地只有上一阶段的基础 Git 状态 / 单文件差异。
- [x] 已确认国际化系统完全缺失、Shift+点击直删缺失；两项均属产品选择或效率改进。
- [x] 依赖核对完成：Pi / Node 已对齐，Next.js 补丁版本未对齐；本地额外依赖必须保留。
- [x] 已逐个审计上游版本范围内的全部非合并提交，发布主题覆盖完整。
- [x] 已汇总优先级、适配冲突点和验收建议；重点标出项目信任与本地 Pi 适配器、MCP 注入和热重载注册表的组合要求。
- [x] 最终卫生检查通过：`git diff --check` 无输出；只修改本次调研所需的 `task_plan.md`、`findings.md`、`progress.md`，业务代码未改。

## 2026-07-28 上游 v0.8.2 跟进实施

- [x] 已读取并应用 `security-review` 与 `planning-with-files`；确认只有上一轮调研记录为未提交修改。
- [x] 已确定六阶段实施顺序和验收标准，不改版本号、不提交、不推送、不运行 `next build`。
- [x] S1：两项安全修复。
- [x] S1a：请求主机允许清单、来源校验、外部主机令牌判断、关键写接口防护完成；10/10 针对性测试、typecheck、diff check 通过。
- [x] S1b：项目信任存储、受限加载、同目录运行保护、确认接口、顶部提示、确认弹层以及技能/插件受限提示完成。
- [x] S1 收口：24/24 安全与协调器针对性测试通过；typecheck、目标文件 lint、diff check 通过；Next.js 与 eslint-config-next 均为 16.2.12。
- [进行中] S2：跨项目标签页和全局技能开关。
- [x] S2：跨项目时清理文件标签和右侧面板，同仓工作树保留；全局技能真实目录加入允许清单，技能写接口补安全校验。
- [x] S2 验收：2/2 针对性测试、typecheck、目标文件 lint、diff check 通过。
- [进行中] S3：快速变更总览和删除文件差异。
- [x] S3：侧栏变更入口、文件数和增删行汇总、差异模式透传、删除文件补丁与只读差异界面完成。
- [x] S3 验收：真实临时仓库与界面接线共 6/6 测试通过；typecheck、目标文件 lint、diff check 通过。
- [进行中] S4：底部固定扩展状态栏。
- [x] S4：扩展状态独立成单行组件，按隐藏键排序、支持终端颜色，并固定到聊天输入区底部。
- [x] S4 验收：3/3 组件测试、typecheck、目标文件 lint、diff check 通过。
- [进行中] S5：中英国际化和 Shift 点击直删。

## 理解（任务 0 后）

- 目标：交付带证据的全栈架构评估报告 ARCHITECTURE_REVIEW.md（中文）＋P0/P1/P2 路线图，给领导抽查用。
- 顺序：任务 2（服务端分层，判据现成）→ 任务 1（前端组件层）→ 任务 3（数据流/API 边界）→ 任务 4（汇总报告）。
- 最大风险：证据不可复现被判作弊 → 每条结论必须附可复跑命令或 file:line，且命令输出已实际贴出。

## 任务 0 核对结果（2026-07-28 复跑）

- [x] `node_modules/.bin/tsc --noEmit` 退出码 0 ✅
- [x] `npm run lint` 无告警，退出码 0 ✅
- [x] 最大 6 文件行数完全一致（ChatInput 2169 / SessionSidebar 1963 / useAgentSession 1651 / ModelsConfig 1648 / AppShell 1643 / MessageView 1451）✅
- [x] 状态密度全部一致（SessionSidebar 38 useState/15 useEffect/9 fetch；useAgentSession 37；AppShell 34/10）✅；components+hooks fetch 总数 59 ✅
- [~] 测试目录：基线称「全仓库唯一测试目录是 lib/adapters/pi/__tests__」。实测 `find . -path ./node_modules -prune -o -name "*.test.*" -print` 命中 44 个文件，其中 39 个散在 lib/ 与 components/ 根下（*.test.mjs）、5 个在 __tests__，__tests__ 确实是唯一测试「目录」。基线表述不精确，但事实指向（测试高度分散、无统一目录）成立。不阻塞，记此注记。
- [x] lib/kernel 无指向 kernel 外的 import ✅；components/hooks 无 import persistence ✅
- [x] 疑点复核：pi-session-reconciler.ts:5 确实 import `@/lib/adapters/pi/pi-task-projector` ✅；runtime-registry.ts 的 "adapters" 只是私有 Map 字段名，并非 import adapters 模块（疑点证伪）；app/api/doctor/route.ts:3 直接 import `@/lib/persistence` ✅；lib/subagent 确为空目录 ✅

## 进行状态

- 任务 0：完成（基线全部核对，1 处表述不精确已注记）
- 任务 2：完成。结论：reconciler→adapters 是 AGENTS.md 批准例外（但 boundary test 不覆盖 services，计问题 4）；runtime-registry「adapters」疑点证伪（字段名非 import）；doctor→persistence 合规（服务端代码）；rpc-manager 1259 行，send 393 行/25 case，11 个 route + 1 个 server bridge 依赖（计问题 3）；lib/subagent 证伪为本地空目录残留，列入 BLOCKED 但不计架构问题。
- 任务 1：完成。结论：无 store/context/状态库（grep 双零），SessionSidebar/useAgentSession/AppShell 分别 38/37/34 个 useState，ModelsConfig 21 个，useAgentSession 返回 71 个成员、ChatInput Props 36 字段（计问题 1）；59 处 fetch 中有明确重复样板，agent-client 仅 2 文件使用（计问题 2）；buildSessionTree/slashMatchRank/模型兼容转换无测试（计问题 5）；MessageView 复用 lib/patch 为正面样板（亮点 2）。
- 任务 3：完成。结论：AppShell:595 走 /api/tasks/resolve 且无 projectPiSession，被 boundary test 锁定（亮点 1）；SSE 无 Last-Event-ID（route 仅 78 行），三通道对账 + 4 处 run-id 迟到结果守卫在现状下必要，列入 P2 简化项（亮点 3）。
- 任务 4：完成。ARCHITECTURE_REVIEW.md 已交付（5 问题 + 3 亮点，每条附可复跑命令/行号 + 实测日期；P0/P1/P2 每步均含改动、收益、风险、预估代价；附 5 条证伪记录）。BLOCKED.md 5 项待裁决。

## 交付清单（2026-07-28）

- ARCHITECTURE_REVIEW.md ✅
- PROGRESS.md ✅（本文件）
- BLOCKED.md ✅（5 项）
- 未触碰任何其他文件；未装依赖、未跑 next build、未动配置。

## 断点续跑交付审计（2026-07-28）

- [x] 已先读本文件，确认任务 0–4 已完成，不重做研究，仅复现交付证据。
- [x] 任务 0 已复跑：tsc/lint 退出码均为 0；6 个大文件行数、状态密度、59 处 fetch 与既有记录一致。
- [x] 分层基线已复跑：kernel 仅内部相对导入；components/hooks 无 persistence 导入；reconciler→adapter、doctor→persistence、空 subagent 目录与既有记录一致。
- [x] 前端结论审计：无 context/store、公共 client 仅 2 个消费者、重复 fetch 样板、纯函数无测试、MessageView 正面样板均复现。
- [x] 服务端/数据流审计：rpc-manager 1259 行/25 case/12 消费者、分层规则与唯一 adapter 例外、AppShell task API、SSE 三路对账均复现。
- [!] 发现需校正：rpc-manager 私有字段实际 18 个（非 16）；run-id 迟到结果守卫实际 4 处（非 8）；空目录时间戳不能证明创建日期，且空目录不进入 Git。
- [x] 补查 ModelsConfig：21 useState/11 useEffect/10 fetch；模型兼容配置转换为未测试纯逻辑，已补入问题 1/2/5。
- [x] 补查事件 journal：已有 sequence/readAfter，但只存持久事件；路线图改为“持久事件补发 + 正文状态快照”，不假设流式正文已持久化。
- [x] 已校正报告：18 个私有字段、4 处 run-id 守卫、11 route + 1 server bridge；删除无法证明的空目录创建日期与“仓库死代码”定性。
- [x] 结构审计补齐：路线图每一步新增“预估代价”，修正边界测试实际行号和 P2 的依赖模块数量。
- [x] 8 条结论逐条复现通过：问题 1–5、亮点 1–3 均获得当前工作区命令输出支持；useAgentSession 返回成员用 TypeScript AST 精确为 71。
- [x] 白名单异常核查：`task_plan.md`/`findings.md` 创建于 12:42、最后修改于 12:43，早于本任务 14:25 的进度文件，内容属于前一轮任务书调研，本任务未触碰；`progress.md` 与 `PROGRESS.md` 是大小写不敏感文件系统下的同一路径表现，不是额外文件。
- [x] 最终验收：5 问题 + 3 亮点 = 8 条；P0/P1/P2 三阶段均逐步写明改动、收益、风险、预估代价；34 处 file:line 引用全部存在且未越界。
- [x] 最终卫生检查：旧错误数字搜索 0 命中、三份交付物行尾空白 0 命中；仅新建/改写 ARCHITECTURE_REVIEW.md、BLOCKED.md、PROGRESS.md，未装依赖、未跑 next build、未改配置或源码、未重启 dev 服务。

## P0 改造执行（2026-07-28）

- [x] P0-0：已读取现有调用点、测试风格和边界规则；改造前 `npm test` 173/173 通过；确认三个优先组件的 25 处 fetch 均可迁移，EventSource 流式通道保留。
- [x] P0-1：通用 JSON 请求工具 6 项测试通过；`agent-client` 已复用；SessionSidebar 9 处、SkillsConfig 6 处、ModelsConfig 10 处请求迁移完成；三批 `npm run typecheck` 均通过；目标组件 fetch 25→0，components/hooks 总数 59→34，EventSource 保留。
- [x] P0-2：补 application/services 架构边界守卫；唯一同步入口白名单和 Pi SDK 禁止规则生效，边界测试 8/8 通过。
- [x] P0-3：三块纯逻辑抽取完成，新增 8 项测试并通过；会话树循环节点不再丢失；`npm run typecheck` 通过。
- [x] P0-4：最终 `npm test` 188/188 通过，`npm run typecheck` 与 `npm run lint` 均退出码 0，`git diff --check` 无输出；未运行 `next build`、未安装依赖、未重启开发服务。

## P0 收口审计（2026-07-28）

- [x] 代码事实：通用请求工具、应用服务层边界守卫和三块纯逻辑抽取均已落地，P0 完成。
- [x] 文档事实：`ARCHITECTURE_REVIEW.md` 已明确区分 P0 前快照与当前状态；`AGENTS.md` 已补普通 JSON 请求约定。
- [x] 本地验证：188 项测试、类型检查、lint、差异卫生检查全部通过。
- [待验证] 实际界面：未做浏览器内人工点选冒烟测试，不宣称已验证交互表现。
- [不适用] 远端与发布：本轮未提交、未推送、未部署，也未检查线上运行状态。
- [只读] 记忆与上级规则：完成盘点，无授权写入；未发现必须同步的项目事实。
- [待批准] 工作区清理：`task_plan.md`、`findings.md` 为一次性记录，未擅自删除。

## P1 改造执行（2026-07-28）

- [x] P1-1：按报告建议拆出通知队列、扩展界面、模型与工具配置职责；主消息/SSE 对账语义保持不变。
- [x] P1-1 第一批：通知队列和扩展界面已分别迁入独立 hook，新增 6 项纯状态测试；`useAgentSession` 由 1,651 行降至 1,485 行，typecheck 通过。
- [x] P1-1 第二批：模型与工具配置迁入独立 hook，新增 3 项优先级/默认值测试；主钩子降至 1,425 行、直接 `useState` 37→22，对外返回仍为 71 个成员。
- [x] P1-1 验收：`npm test` 197/197、typecheck、lint、`git diff --check` 全部通过；15 秒对账、`visibilitychange`/`online` 触发、运行编号和迟到事件守卫仍在。
- [待验证] 浏览器冒烟：30141 端口无开发服务，未擅自启动或重启。
- [已执行] P1-3 物理拆分子面板；P1-2 继续等待状态管理方案裁决。
- [后续已解阻] P1-2：用户选择 Zustand 后已完成，详见本文件末尾解阻执行记录。
- [x] P1-3：ModelsConfig、ChatInput、SessionSidebar 目标子面板均已物理拆分。
- [x] P1-3b：ModelsConfig 的共享表单控件、模型连接测试、OAuth 与 API Key 面板已迁到 `components/models-config/`；主文件 1,589→968 行、`useState` 文本计数 21→12，typecheck/lint 通过。
- [x] P1-3c：ChatInput 的附件预览、斜杠命令和模型选择面板已迁到 `components/chat-input/`；主文件 2,160→1,856 行、`useState` 文本计数 18→16，typecheck/lint/diff check 通过。
- [x] P1-3d：SessionSidebar 的工作树创建/删除/脏目录确认/下拉状态已迁到 `components/session-sidebar/`；主文件 1,905→1,457 行、`useState` 文本计数 38→30，typecheck/lint/diff check 通过。
- [x] P1-3e：最终 `npm test` 197/197，typecheck/lint/diff check 通过；`ARCHITECTURE_REVIEW.md` 与 `AGENTS.md` 已同步新的组件边界。
- [历史结论] 当时 P1-1、P1-3 已完成、P1-2 等待裁决；后续已采用 Zustand 完成。
- 断点起始基线：P0 最终 `npm test` 188/188、typecheck/lint 均通过。

## P1-1 收口审计（2026-07-28）

- [changed-and-verified] 代码：三个独立 hook 已接入，标准测试 197/197、typecheck、lint 和差异卫生检查通过。
- [pending] 运行态：本机开发服务未运行，未做浏览器点选；没有把自动化通过写成界面已验证。
- [changed-and-verified] 文档：架构报告、项目规则、计划、发现和本进度已同步 P1-1 当前状态。
- [changed-and-verified] 规则：`AGENTS.md` 已写清会话主链与三个子 hook 的职责边界；没有改写上级规则。
- [generated-read-only] 记忆：当前 Codex 记忆只读且无相关条目，未获授权写入。
- [out-of-scope] 远端/发布：未提交、未推送、未部署，不声明线上状态。
- [pending] 工作区清理：`task_plan.md`、`findings.md` 和既有 `.zcode/plans/plan-sess_4fa99e1c-5a80-4a45-bfff-51cd5cf5fd02.md` 均保留，未获用户汇报后清理确认。

## P1-3 收口审计（2026-07-28）

- [changed-and-verified] 代码：三个大组件的目标子面板已迁到命名子目录；全量测试 197/197、typecheck、lint 和差异卫生检查通过。
- [pending] 运行态：本机开发服务仍未运行，未做浏览器点选；焦点、快捷键、弹层位置和工作树操作没有被宣称为人工验证通过。
- [changed-and-verified] 文档/规则：架构报告、项目文件地图、前端面板职责、计划、发现和本进度已同步。
- [blocked] P1-2：状态库或零依赖方案尚未裁决，未安装依赖，也未擅自迁移跨组件共享状态。
- [out-of-scope] 远端/发布：未提交、未推送、未部署，不声明线上状态。
- [pending] 工作区清理：一次性计划记录与既有 `.zcode` 方案均保留，未获批准删除。

## P2 改造执行（2026-07-28）

- [x] P2 断点恢复：已先读本文件，确认 P0、P1-1、P1-3 完成且 P1-2 阻塞；未重做既有改造。
- [x] P2 计划建立：执行顺序为 P2-1 后端协调器 → P2-2 持久事件补发 → 跳过受阻的 P2-3 → 收口。
- [x] P2-0：确认协调器 1,259 行/25 个命令分支，journal 已有单调序号和 `readAfter`，聊天 SSE 尚无补发；针对性测试 6/6、typecheck 通过。
- [x] P2-1a：确定注册表、操作生命周期、扩展界面桥和命令域的迁移边界。
- [x] P2-1a/b：操作生命周期与 `globalThis` 注册表/启动锁/运行广播已迁到 `lib/rpc/`；主文件 1,259→1,176 行，新旧针对性测试 5/5、typecheck 通过。
- [x] P2-1c 第一批：扩展界面请求、等待队列、自定义界面、状态条/小组件和命令上下文动作已迁到 `lib/rpc/extension-ui-bridge.ts`；主协调器只通过窄接口委托。
- [x] P2-1c 第二批：桥接静态/行为测试连同注册表和生命周期测试共 7/7 通过，typecheck 通过；`rpc-manager.ts` 由 1,176 行降至 786 行。
- [x] P2-1c 第三批：17 类普通配置/查询命令迁到显式处理表，合法 `null` 与未处理回退由独立哨兵区分；复杂生命周期命令仍留在协调器，case 25→8，主文件 786→659 行。
- [x] P2-1d：P2 新增针对性测试 10/10；全量 `npm test` 205/205，typecheck、lint、`git diff --check` 全部通过。
- [x] P2-2a/b：持久事件通过 SSE `id` 携带 journal 单调序号；自动重连读 `Last-Event-ID`，手工重连带 `?since=`；补发严格按当前 Task/Run 过滤。
- [x] P2-2c：客户端按会话记录最后序号，重建事件流时带回游标；旧 EventSource 的迟到消息会被丢弃，原运行编号守卫保持。
- [x] P2-2d（自动化）：游标/跨批次/任务运行隔离/实时序号回传/客户端接线测试通过；15 秒轮询及可见性/联网触发保持。真实浏览器断线未验证，30141 端口为 `HTTP 000`，未启动服务。
- [x] P2-2 收口加固：客户端旧游标高于重建后 journal 水位时回落到当前水位；实时持久事件按最后已发送序号去重，避免幂等重送倒退游标。
- [后续已解阻] P2-3：用户选择 Zustand 后已完成共享状态迁移与中转参数清理。
- [x] P2-4：全量 `npm test` 211/211，typecheck、lint、`git diff --check` 通过；架构报告、AGENTS、BLOCKED 与本进度已同步。

## P2 收口审计（2026-07-28）

- [changed-and-verified] 后端协调器：公开入口不变，主文件 1,259→659 行，命令分支 25→8；四块迁出职责均有针对性测试。
- [changed-and-verified] 事件补发：只补 durable journal 事件，消息正文仍走会话快照；没有扩大敏感数据持久化。
- [pending] 运行态：本机开发服务未运行，未做浏览器真实断网/后台标签页冒烟，因此没有减少轮询。
- [resolved] P2-3：后续采用 Zustand 完成；`BLOCKED.md` 已清空。
- [out-of-scope] 远端/发布：未提交、未推送、未部署，不声明线上状态。
- [rules-followed] 未安装依赖、未运行 `next build`、未启动或重启开发服务。

## P1-2 / P2-3 解阻执行（2026-07-28）

- [x] 用户裁决：采用状态库；授权安装依赖和自行启动本地服务做浏览器验证；不做流式正文逐片段回放；删除 `lib/subagent/`；doctor 与 application Node crypto 维持现状。
- [x] 方案假设：沿用报告候选 Zustand v5，只迁移跨顶层组件共享的导航/工作区状态，局部表单、弹窗和消息流状态不迁移。
- [x] 盘点完成：共享 store 只放选中会话、新会话目录、有效 cwd 和项目根；侧栏 worktree 快照与 unread 集合保持本地。
- [x] 已安装 `zustand@5.0.12`（精确版本）；既有 peer/audit 警告已记录，不做无关依赖升级。
- [x] 共享 store 已建立，3 项原子选择/新会话/局部更新测试通过。
- [x] AppShell、SessionSidebar、ChatWorkspaceView/ChatWindow 已接入单字段 selector；公开参数链删除 5 个中转字段，侧栏工作树快照/未读集合和局部表单、弹窗、消息流均未进入共享 store。
- [x] 针对性验证：共享状态行为与架构边界合计 12/12 通过，typecheck、目标文件 lint、`git diff --check` 通过；同一目录补全项目根不会再重置新会话。
- [x] 已再次确认 `lib/subagent/` 内容与源码引用均为 0，并按用户裁决删除空目录；该目录没有内容且不受 Git 跟踪，只能按需重新创建。
- [x] `BLOCKED.md` 的 5 项均已裁决：doctor 与 application Node crypto 保持，采用 Zustand，不做正文逐片段回放，空目录已删；待裁决清单现为“无”。
- [x] 全量自动化验证：`npm test` 215/215，typecheck、lint、`git diff --check` 全部通过；只出现项目既有的 `MODULE_TYPELESS_PACKAGE_JSON` 性能告警。
- [x] 默认开发服务因本机 kernel 数据库 schema 4 高于当前代码支持的 3 而在启动后退出；未修改用户数据库，浏览器验证改用独立临时数据目录。
- [x] 浏览器实测：首页 200、输入焦点正常、项目下拉可开、模型/技能/插件/MCP 四弹层可开关；测试目录非 Git 根，工作树入口按设计只读。
- [x] 真实断线恢复：关闭开发服务并重新启动后，运行状态 SSE 请求从 1 增至 2；恢复后控制台错误、页面脚本错误、非预期请求失败均为 0。
- [x] 临时开发服务、临时 kernel 数据库、测试脚本和截图均已关闭/删除；未运行 `next build`，未触碰默认用户数据库。
- [x] `ARCHITECTURE_REVIEW.md` 已同步路线图完成状态、浏览器实测边界与用户裁决；`AGENTS.md` 已补共享工作区状态边界和文件地图。

## P1-2 / P2-3 最终收口审计（2026-07-28）

- [changed-and-verified] 状态边界：`zustand@5.0.12` 只管理 4 个共享导航/工作区字段；5 个顶层中转参数已删除，局部 worktree/unread/表单/弹窗/消息流状态未全局化。
- [changed-and-verified] 自动化：全量测试 215/215，typecheck、lint、`git diff --check` 通过；共享状态行为与架构边界针对性测试 12/12 通过。
- [changed-and-verified] 浏览器：首页、输入焦点、项目下拉、四类配置弹层和非 Git 工作树只读态通过；运行状态 SSE 在真实服务关闭/恢复后重新连接。
- [decision-applied] 不做流式正文逐片段回放；doctor 直连 persistence 与 application Node crypto 保持；15 秒轮询保留。
- [cleanup] `lib/subagent/` 本地空目录已删除；临时服务、临时数据库、浏览器脚本和截图均已清理。
- [environment-note] 默认用户 kernel 数据库 schema 4 高于当前代码支持的 3，直接运行本工作区开发服务会退出；本轮未改用户数据库，验证使用临时数据目录。
- [blocked] 无。`BLOCKED.md` 为“无”。
- [out-of-scope] 未提交、未推送、未部署；未运行 `next build`。

## 上游 v0.8.2 跟进实施（2026-07-28）

- [x] 两项安全修复：请求主机/来源边界和项目资源信任门禁已落地；未信任项目进入受限模式，信任后刷新相关资源。
- [x] 标签页和全局技能：跨真实项目清理文件标签，同仓不同工作树保留；全局技能目录可切换。
- [x] 快速变更：显示文件数量及增删行统计，点击直接进入差异视图，已删除文件可查看只读删除补丁。
- [x] 状态栏：扩展状态固定在输入区下方，键只负责排序，文本保持单行并支持终端颜色；空字符串状态不再被误删。
- [x] 国际化和快捷删除：内置英文/简体中文语言包与自动识别、语言菜单已接入主要界面；只有 Shift 点击删除按钮会跳过确认。
- [x] 自动验收：`npm test` 248/248，typecheck、lint、`git diff --check` 全部通过；未运行 `next build`。
- [x] 浏览器验收：使用独立临时数据目录和本机 Chrome 验证语言来回切换、快速变更入口及页面脚本错误，全部通过；临时服务、数据目录和脚本已清理。
- [environment-note] Python Playwright 包缺少自带 Chromium，首次脚本未进入页面；随后复用本机 Chrome 完成同一检查，没有下载依赖或修改项目。
- [out-of-scope] 未提交、未推送、未发布，也未改版本号。

## 内置扩展通用注入层（2026-07-30）

### 当前理解（任务 0，≤10 行）

1. 目标：把内置扩展解析、去重、注入改为注册表驱动，本次注册表仍只包含 MCP。
2. 顺序：基线核对 → 安装依赖 → 通用化与单测 → 红绿反向验证 → 全量检查 → MCP 冒烟 → 范围核验 → 提交。
3. 最大风险：MCP 去重或状态订阅被无意改变；优先保持现有行为。
4. 任务书写 99 行、实测 98 行；机制与版本一致，证据已写入 `BLOCKED.md`。
5. 另有大小写路径冲突；已恢复既有进度内容，本任务记录追加在同一逻辑文件。

### 执行记录

- [x] 创建分支 `feat/bundled-extensions`。
- [x] 基线 `npm run check` 退出码 0；主测试 tests 248 / pass 248 / fail 0 / skipped 0；适配器测试 11 / 11。
- [x] 版本核对：`pi-subagents` 0.37.2。
- [x] 机制核对：运行时解析包目录、缺失返回 null、global/project 双层去重、会话工厂注入路径均与任务书一致。
- [x] 安装并核验依赖：`npm ls pi-subagents` 退出码 0，版本 0.37.2；`package.json` 只增加一行直系依赖。
- [x] 实现注册表驱动的通用注入层：注册表仅含 MCP；解析缓存按包名区分；去重按包名查 global/project；工厂遍历注册表组装路径并在成功注入时调用 setup。
- [x] 针对性验证：新增测试 6/6，类型检查和目标文件 lint 均退出码 0。
- [x] 新增规定单测并完成红→绿反向验证：临时把字符串去重断言改为 false 后 tests 6 / pass 5 / fail 1（退出码 1）；还原后 tests 6 / pass 6 / fail 0 / skipped 0（退出码 0）。
- [x] 最终 `npm run check` 退出码 0：主测试 tests 254 / pass 254 / fail 0 / skipped 0（基线 248，增加 6）；适配器测试 11 / 11。
- [x] MCP 冒烟测试：开发服务 30141 启动成功；创建会话返回 200 与 sessionId `019fb052-d801-7077-ada2-e1e1d4d775b7`；`get_state` 返回 `mcpStatus`（version 1、servers 空数组）；开发服务已用 Ctrl-C 关闭。
- [x] 范围核验：暂存后 `git diff main --stat` 共 9 个文件；除大小写冲突下显示为 `progress.md` 外，全部属于白名单；`package.json` 只增加两行指定依赖；`git diff --cached --check` 无输出。
- [x] 提交：`feat: generalize bundled extension injection`。

### 错误与偏差

- `lib/mcp-extension.ts` 行数描述偏差；详见 `BLOCKED.md`。
- `PROGRESS.md` 与既有 `progress.md` 在大小写不敏感文件系统冲突；详见 `BLOCKED.md`。
- `npm install` 出现既有 React peer 覆盖警告与审计报告（32 项漏洞），安装成功；不做越界依赖升级或修复。
- 查阅测试风格时误用了不存在的 `lib/rpc-manager-boundary.test.mjs` 路径（退出码 2）；未重复执行，改从已确认存在的 `lib/project-trust.test.mjs` 获取测试约定。
- 冒烟前读取动态路由时未给方括号路径加引号，zsh 将其当成通配符（退出码 1）；不影响代码，后续使用带引号路径。
- 首次 `git diff main --stat` 不包含尚未暂存的新文件，这是 Git 的正常行为；最终范围证据须在暂存后重跑，不能拿该次输出充当完整验收。

### 实现决策

- 沿用任务书指定接缝：`lib/bundled/index.ts` 放注册表与类型，`lib/bundled/pi-mcp-adapter.ts` 放唯一 MCP spec。
- 通用解析与去重留在 `lib/mcp-extension.ts` 并按包名参数化，避免越界新增第三个公共工具文件；会话工厂遍历注册表。

## 移除 /mcp、/mcp-auth 命令并迁移运维操作至 MCP 设置页（2026-07-30）

- [x] patch-package 固化 adapter 改动：`patches/pi-mcp-adapter+2.13.0.patch`（删 `registerCommand("mcp"/"mcp-auth")` + 物理删除 `mcp-panel.ts`/`mcp-setup-panel.ts`/`panel-keys.ts`，`commands.ts` 仅保留 reconnect/auth/logout 四个函数）；`package.json` 钉死 `pi-mcp-adapter@2.13.0`、新增 `postinstall: patch-package`、npm `files` 含 `patches`。
- [x] 新增 event-bus 控制通道（`pi-mcp-adapter/control-request|result|notice|ready/v1`），per-bus owner-token（`Symbol.for`）防止 SDK reload 后旧工厂监听器重复应答；pi-web 侧经 `pi-session-factory`（requestId 关联 + 120s 超时）→ `rpc-manager` → kernel `mcp_action` 命令 → `POST /api/mcp/action`。
- [x] `McpConfig` 设置页：头部「全部重连」、详情「重新连接」（非禁用服务器）、「OAuth 登录 / 清除认证」（http 服务器，替换原"请在 pi CLI 中运行 /mcp-auth"提示）；仅 live 会话可用。
- [x] 干净 `npm ci` 验证补丁流：postinstall 应用成功，面板文件不存在，`registerCommand("mcp"` 计数为 0，jiti 冒烟 OK；typecheck/lint 通过；kernel 协议测试 9/9（含 `mcp_action` parser 用例）、pi-adapter 测试 11/11。
- [x] 浏览器实测（dev 30141 + 临时 stdio demo 服务器 + 不可达 http 服务器 `fake-oauth`，测后均已清理）：① 斜杠面板仅 5 个内置命令，过滤 `mcp` 无 /mcp、/mcp-auth；② 「重新连接」内联返回 `Reconnected to demo`，「全部重连」返回 `Reconnect finished` 且状态 已缓存→已连接·1 工具；③ http 服务器显示 OAuth 按钮，登录返回 `started` 并展示提示文案，SSE 捕获 `Authenticating fake-oauth...` 与 `Failed to authenticate ...` 失败通知（bus→SSE→toast 管道闭环），「清除认证」confirm 后返回 `OAuth credentials cleared for "fake-oauth".`；④ `reload` 命令后控制通道仍正常（owner-token 去重生效）。
- [x] 已知非问题：会话启动后再向配置文件新增服务器，adapter 运行时配置快照不会自动刷新（原 TUI 流程亦如此）；设置页保存流程本就调用 `onReloaded` 触发会话 reload，带外编辑文件需 `/reload`。

### 错误与偏差

- `npm run test` 全量有 1 个既有失败（SessionSidebar shift+click 删除确认），源自本次会话前已暂存的 SessionSidebar 重构，与 MCP 改动无关。
- iCloud Desktop 同步导致 `npm ci`/`rm -rf node_modules` 多次 ENOTEMPTY，重试循环后成功。

## 修复：新加 MCP 服务器后模型视角"未连接"不可用（2026-07-31）

__问题__：添加 MCP 服务器（默认 `lazy` 生命周期）后若不手动点「重新连接」，模型拒绝调用 MCP 工具——从未连接过的服务器没有工具元数据缓存，`buildProxyDescription` 跳过它（`totalItems===0`），状态输出也不给连接引导（原文案还引用已被移除的 `/mcp reconnect`）。

- [x] 修复①（产品侧，`components/McpConfig.tsx`）：设置页添加/编辑保存、启用（toggle 打开）后自动调用 `runMcpAction("reconnect", name)`——`/api/mcp` 路由在响应前已 `await reloadActiveSession`，控制通道此刻已就绪，故无竞态；编辑禁用中的服务器跳过。
- [x] 修复②（模型侧，补丁固化进 `patches/pi-mcp-adapter+2.13.0.patch`，共 5 个文件 16 处文案）：清除全部面向模型的 `/mcp`、`/mcp-auth` 死引用——disabled 提示改为"可在 MCP 设置页启用"；OAuth 提示收敛为 `mcp({ action: "auth-start" })`；`mcp({})` 状态页脚追加 `mcp({ connect: "name" }) to connect`；`mcp({server})` 对未连接/无缓存服务器明确提示 `Use mcp({ connect: "..." })`。
- [x] 验证：`npx patch-package` 重新生成补丁（10 个文件）；jiti 冒烟 OK；typecheck/lint 通过；kernel 协议测试 9/9。
- [x] 浏览器实测自动重连（dev 30141，会话 `019fb17c`，临时 stdio 服务器 verify-demo，测后已删除清理）：第一次添加时因测试服务器脚本自身错误（`.mjs` 里用 `require`）连接 failed——但__自动重连在保存后 1s 内即触发__（无需手动点击，通道时序正确）；修好脚本后重新添加，保存后首次轮询（<0.5s）即 `connected · 1 工具`，面板显示「已连接 · 1 工具」与 `Reconnected to verify-demo` 内联确认。
- [x] 环境清理：`~/.config/mcp/mcp.json` 恢复为用户原有 3 个服务器（web-search-prime/web-reader/zread），临时文件全部删除。

## UI：MCP 状态移入模型选择器一行（2026-07-31）

__需求__：消息区左下方独立一行的「🔌 MCP: N servers enabled」扩展状态栏改为与模型选择器同一行展示，不再单独占行。

- [x] `components/ExtensionStatusBar.tsx`：拆出内联组件 `ExtensionStatusText`（role=status 的 span，ANSI 分段渲染、ellipsis）；原 `ExtensionStatusBar`（36px 行）改为组合它，样式与行为不变，3 个单测原样通过。
- [x] `components/ChatInput.tsx`：新增可选 prop `extensionStatuses?: ExtensionStatusItem[]`，在底栏左侧 ModelSelector 之后渲染 `ExtensionStatusText`（maxWidth 移动端 140 / 桌面 260，flexShrink 1 + ellipsis 防撑破布局）。
- [x] `components/ChatWindow.tsx`：ChatInput 传入 `extensionStatuses`；删除原独立行 `<ExtensionStatusBar>` 及其 import（原 L749，全仓唯一使用点）。附带效果：新会话空态布局（isEmptyNew）此前无状态栏，现在同样有了一致的展示位置。
- [x] 验证：typecheck/lint 通过；`ExtensionStatusBar.test.mjs` 3/3；浏览器实测（dev 30141，会话 019fb17c，`get_state` 唤醒 RPC）：全页 role=status 元素唯一，aria-label「🔌 MCP: 3 servers enabled」，与模型选择器同一行且垂直居中（中心 y 均为 696），独立状态行已消失。

## i18n：MCP 扩展状态文案中文化（2026-07-31）

__问题__：状态文案由 pi-mcp-adapter 生成（`init.ts updateStatusBar` 等），adapter 无 locale 概念、永远输出英文，中文界面下「MCP: 3 servers enabled」突兀。

- [x] 新增 `lib/extension-status-i18n.ts`：展示层重写——识别 adapter 的 4 类已知文案（enabled 汇总含 connected/disabled 后缀、connecting N、connecting name、Authenticating name），经 pi-web i18n 重建；stripAnsi 后匹配，未知文案原样透传；相对导入保持 plain-node 可测。
- [x] i18n key（`extension.mcp.*`，en + zh-CN 各 7 条）：zh「🔌 MCP：{count} 个服务器已启用（{count} 个已连接）（{count} 个已禁用）」「正在连接…」「正在认证…」；en 重建后与 adapter 原文逐字一致（含单复数 server/servers）。
- [x] `ChatInput` 渲染前 `localizeExtensionStatuses(extensionStatuses, t)`；`ExtensionStatusBar`/`ExtensionStatusText` 保持纯净不感知 locale。
- [x] 新增 `lib/extension-status-i18n.test.mjs` 7 例（zh 汇总/后缀、en 单数、瞬态、ANSI 穿透、未知透传、列表映射恒等）全绿；typecheck/lint 通过；全量 269 测试 268 过，唯一失败仍为既有 SessionSidebar shift+click 用例（源自会话前已暂存重构，与本次无关）。
- [x] 浏览器实测语言切换：zh-CN → 「🔌 MCP：3 个服务器已启用」；en → 「🔌 MCP: 3 servers enabled」；切换即时生效无需刷新。

## MCP 设置页：粘贴 JSON 识别添加服务器（2026-07-31）

__需求__：手动一项项填表单太慢，要求直接粘贴 `{"mcpServers": {"zai-mcp-server": {"type":"stdio","command":"npx","args":[...],"env":{...}}}}` 这类配置自动识别添加。

- [x] 新增 `lib/mcp-import.ts`：`parseMcpImport(text)` 支持三种形态——`mcpServers` 包装（标准 Claude/Cursor 格式）、裸 name→entry map、单条 entry（无名称时只填充表单）；自动剥离 ```` ```json ```` 代码围栏；Claude 风格 `type: "stdio"|"http"` 键丢弃（pi 由 command/url 推导传输方式）；env/headers 校验为 string→string，args 校验为 string[]，lifecycle 校验为 4 个合法值；错误文案中文并带服务器名定位。type-only 引用 `McpServerEntry`，保持 plain-node 可测。
- [x] 新增 `lib/mcp-import.test.mjs` 11 例全绿（标准包装/围栏/多服务器/裸 map/单条目/http auth+lifecycle/非法 JSON/缺 command 与 url/args 非数组/非法 lifecycle/空对象）。
- [x] `components/McpConfig.tsx` 添加表单顶部新增「从 JSON 导入（可选）」面板：textarea 粘贴 →「识别 JSON」；识别出 1 个服务器直接填充表单（含名称）并提示确认后保存，未含名称则仅填充字段提示补名；识别出多个则出现批量面板「识别到 N 个服务器」→「全部添加 N 个」逐个 POST upsert（同名冲突先 confirm 列出名单），完成后自动选中第一个并对每个 `autoReconnect`；保存/取消/新建表单时 `resetImport()` 清理导入态。抽出 `formFromEntry` 作为 `entryFromForm` 的精确逆变换，`formFromServer` 改为委托它。
- [x] 验证：typecheck/lint 通过；全量 280 测试 279 过（唯一失败仍为既有 SessionSidebar shift+click 用例，源自会话前已暂存的重构，与本次无关）。
- [x] 浏览器实测（dev 30141，会话 019fb17c，项目 `~/Desktop/存档`）：① 粘贴用户给出的 zai-mcp-server 原文 → 表单自动填充（type 键丢弃、args/env 转多行），保存写入项目 `.mcp.json`，详情页密钥正确掩码 `***`，保存后自动重连触发（假服务器报 `Failed to reconnect to zai-mcp-server`，证明流程闭环），状态行变「4 个服务器已启用」；② 带围栏的双服务器 JSON → 批量面板 →「全部添加 2 个」一次写入，状态行变「6 个服务器已启用」。
- [x] 环境清理：3 个测试服务器经 `POST /api/mcp` remove 删除（均 `removed:true`），`.mcp.json` 清空后按设计自动删除；重开面板列表恢复为原有 3 个全局服务器（web-reader/web-search-prime/zread），刷新页面后状态行恢复「🔌 MCP：3 个服务器已启用」。

### 错误与偏差

- 清理带外删除后，仍打开的模态框列表与状态行保留旧值（模态框列表为组件本地状态、状态行来自 adapter setStatus 的 SSE 推送）：属预期，重开面板/刷新页面后即一致；非数据错误。

## Vite + 独立 Node 后端迁移（2026-08-01）

### 当前理解（任务 0，≤10 行）

1. 目标：让 Web 与 Electron 全部改跑 Vite 前端和独立单进程 Node 服务，Next.js 完全退场，用户行为不变。
2. 顺序：先锁定基线和 67 条路由 → 完成后端及红绿冒烟 → 迁移前端 → 切换启动/发布 → 删除 `app/`。
3. 最大风险：动态路由参数、流式连接和 Next.js 请求/响应语义迁移时出现无声偏差。
4. 防线：先做可机械核对的路由清单，再以真实接口冒烟和故意破坏后的红→绿证明覆盖有效。
5. 严格边界：`lib/**`、全部 `.test.mjs`、既有 test 脚本只读；组件和 hooks 仅做去 Next.js 化。
6. 当前分支：`refactor/vite-foundation`；从干净的 `main@56311cd` 创建，未生成空的“保住提交”。

### 任务 0：基线核对

- [x] `node_modules/.bin/tsc --noEmit -p tsconfig.typecheck.json`：退出码 0。
- [x] `npm run lint`：退出码 0，0 错误、0 警告。
- [x] `npm run test`：tests 280 / pass 278 / fail 2 / skipped 0；失败仅为任务书具名的两项。
- [x] `npm run test:pi-adapter`：tests 11 / pass 11 / fail 0 / skipped 0。
- [x] `find app/api -name route.ts | wc -l`：67；排序清单已写入 `scripts/route-inventory.txt`。
- [x] 已创建并切换到 `refactor/vite-foundation`，后续不在 `main` 上施工。
- [!] 任务书所述“大量未提交改动”与实测不符；当前工作树起始即为空，证据与处理写在 `BLOCKED.md` 最上面。

### 阶段计划

- [进行中] 任务 1：独立后端、67 条路由、3 条 SSE、关键接口冒烟和红→绿反向验证。
- [待开始] 任务 2：Vite 前端、代理/静态资源、深链、构建与 Next.js 引用清零。
- [待开始] 任务 3：Web/Electron 启动切换、发布配置、先提交再删除 `app/`、最终全量验收。
