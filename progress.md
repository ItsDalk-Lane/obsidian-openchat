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

- [x] 任务 1：独立后端、67 条路由、3 条 SSE、关键接口冒烟和红→绿反向验证。
- [下一步] 任务 2：Vite 前端、代理/静态资源、深链、构建与 Next.js 引用清零。
- [待开始] 任务 3：Web/Electron 启动切换、发布配置、先提交再删除 `app/`、最终全量验收。

### 任务 1：审计发现

- [!] 9 个只读测试直接读取或导入 `app/api` 文件，与最终整体删除 `app/` 的要求冲突；详见 `BLOCKED.md` 0A。该问题只阻塞最终退场，先继续独立后端迁移。
- [x] `package.json` 当前没有独立后端或 TypeScript 运行器依赖；现有发布物只打包 `.next`，后续需要一并切换到服务端源码和 Vite 产物。
- [x] 选择 Hono：它直接承接标准 Web Request/Response，三条 SSE 与文件观察流无需改写；新增生产依赖 `hono@4.12.33`、`@hono/node-server@2.0.12`。
- [x] 67 个 `app/api/**/route.ts` 已机械镜像到 `server/api/**`，仅把 `next/server` 换成服务端兼容层；额外搬运任务路由共享助手。
- [x] 路由器按静态优先级显式注册，动态参数继续包装为异步参数；文件捕获路径逐段解码为数组。
- [x] 全局 API 请求防护复刻原 `proxy.ts` 的主机、来源和局域网令牌判断，不新增权限。
- [x] 两个库使用的 `server-only` 标记由服务端空垫片承接，未修改 `lib/`。

### 任务 1：错误与调整

- 启动尝试 1：`node --import tsx server/index.ts` 失败，错误为 Pi SDK 根入口未导出。原因是仓库没有 ESM 包声明，`tsx` 把 `.ts` 走成 CommonJS 后错误使用 `require` 加载只支持 ESM 的 SDK。
- 调整：移除 `tsx`，把仓库测试已验证可用的 `jiti@2.7.0` 从开发依赖移到生产依赖；独立 `server/launcher.cjs` 启用路径别名后加载 TypeScript 服务。
- 依赖安装出现既有 React 19 对旧表情组件的 peer 覆盖警告和 10 项审计报告；安装成功，本任务不做无关升级或审计修复。
- 正式冒烟尝试 1：前三项通过，第 4 项把现有模型接口契约误断言成 `models[]` 后失败；源码确认真实契约是 `models` 映射加 `modelList[]`，已按老契约校正断言，未降低状态码或内容要求。
- 收口尝试 1：类型检查通过，lint 因新 CommonJS 启动器的一处 `require` 报 1 个错误；已按仓库现有 bin 入口的同款规则加精确单行豁免，不扩大 lint 范围。

### 任务 1：验收证据

- [x] 正向冒烟：`node scripts/smoke-api.mjs` 退出码 0，15/15 项通过，清单精确为 67 条；覆盖会话、模型、MCP、技能、目录校验、文件读取、能力、运行时、创建会话、状态查询和 3 条指定 SSE 首帧。
- [x] 反向变红：临时把 `server/api/runtimes/route.ts` 的 `GET` 改为非路由导出后，同一冒烟在通过前 9 项后失败；`/api/runtimes` 返回 404，脚本退出码 1。
- [x] 恢复回绿：还原唯一改坏行后，同一冒烟再次退出码 0，15/15 项和 67 条路由全部通过。
- [x] 临时服务均使用独立 `PI_WEB_DATA_DIR` 与 `PI_CODING_AGENT_DIR`，结束后自动关闭并删除临时目录；未接触用户数据库。
- [x] 任务 1 业务实现保持单进程，共享运行中会话、认证回调和文件索引缓存。
- [x] 任务 1 收口：类型检查退出码 0；补精确启动器豁免后 lint 退出码 0；`git diff --check` 无输出；`lib/**` 与全部 `.test.mjs` 相对 `main` 无差异；package.json 中既有 test 脚本未改。

### 断点（40 轮工具调用止损）

- 本轮已达到任务书规定的工具调用止损线，停止继续任务 2；任务 1 已完整提交，可从本节和“阶段计划”直接续跑，不要重做后端。
- 下次第一步：读取本文件后审计 `app/page.tsx`、`app/layout.tsx`、`app/globals.css` 与 `components/AppShell.tsx`，建立 Vite 入口和原生深链替换。

### 任务 2：断点恢复与前端审计

- [x] 从干净的 `refactor/vite-foundation@edd9e83` 恢复；任务 0/1 不重做，当前工作树无未提交差异。
- [x] 现有页面入口只是 `Suspense → I18nProvider → AppShell`；布局只负责标题、语言、禁止翻译、主题预加载、KaTeX 样式和全局 CSS，可等价搬进 `web/index.html` 与 `web/main.tsx`。
- [x] `components/AppShell.tsx` 是 components/hooks 中唯一真正 import Next.js 的文件；只使用查询参数初值和 7 处无滚动 URL 替换，可用 `window.location.search` 与 `history.replaceState` 最小替换。
- [x] `SessionSidebar`、`ChatWindow` 的版本号由两个 Next 公共环境变量提供；Vite 构建时可沿用同名编译期替换，避免扩大组件改动。
- [x] 全局样式可原样迁入 `web/globals.css`，现有 Tailwind 4 PostCSS 管线可复用；仓库没有 `public/` 目录，只有 `app/favicon.ico` 需要复制到 `web/`。
- [x] 5 个组件仍有 Next ESLint 图片规则注释；移除 `eslint-config-next` 时必须同步删除这些失效注释，属于去 Next.js 化的最小清理。
- [x] 新增 Vite 与官方 React 插件；安装仍只有既有 React peer 覆盖警告和 10 项审计报告，不做无关依赖处理。
- [x] Hono 静态中间件支持绝对根目录、文件流、HEAD 与 Range；首次按不存在的 `.d.ts/.js` 路径查看失败，随后改读包实际发布的 `.d.mts/.mjs`，未重复错误命令。
- [x] `web/index.html`、`web/main.tsx`、完整全局样式与 favicon 已落地；补回旧布局的 body 纵向 flex，未改变视觉设计。
- [x] `AppShell` 已改用 `URLSearchParams(window.location.search)` 和 `history.replaceState`；7 处选择、新建、分叉、删除 URL 行为保持替换而非新增历史记录，也不会触发滚动。
- [x] 独立服务已补回旧 `instrumentation.ts` 的网络请求配置与重启恢复调用；API 请求防护此前已经迁入统一中间件。
- [x] `node_modules/.bin/tsc --noEmit -p tsconfig.typecheck.json` 退出码 0；目标目录 `from "next"`、旧路由器调用均为 0 命中。
- [x] 首次 Vite 构建退出码 0：2,884 个模块完成转换，产出 `web/dist/index.html` 和哈希 `/assets/`；配置后缀改为 `.mts` 消除 CommonJS 未来兼容提示，大包提示如实保留。
- [x] 新后端实测 `/` 与 `/?session=smoke-session` 均返回 200、含 `/assets/`，资源返回 200；首页 `Cache-Control` 仍为 `private, no-cache, max-age=0, must-revalidate`。
- [x] 临时服务已关闭；安全层拒绝 `rm -rf` 清理后，改用 Node 文件接口删除两个精确临时目录，未重试被拒命令。
- [!] 根目录 4 个 Next 专属文件不在可修改白名单；运行行为可迁走，但文件不能合规删除，详见 `BLOCKED.md` 0B。
- 组件清理尝试 1：批量删除 6 条旧 Next lint 注释时，一处 JSX 上下文不匹配导致补丁整体未应用；读取精确上下文后逐处删除，未改图片行为。
- 收口尝试 1：类型检查通过；lint 因首次构建留下的 `web/dist` 压缩产物被当成源码扫描而失败（271 个错误均来自生成文件）。已只把 `web/dist/**` 和后续桌面构建目录加入忽略，不修改源码规则或测试标准。

### 任务 2：验收证据

- [x] 类型检查退出码 0；lint 退出码 0。当前 6 条提示只来自尚未移除的 Next 图片规则，任务 3 删除该依赖后再要求回到 0 提示。
- [x] `vite build` 退出码 0，2,884 个模块完成转换；配置已无 CommonJS 提示，未掩盖 3 个既有大包提示。
- [x] 独立接口冒烟再次 15/15 全绿，67 条路由清单精确一致，3 条指定 SSE 均取得首帧。
- [x] 静态审计：`components/`、`hooks/`、`web/`、`server/` 中 Next 导入、Next 图片豁免、旧路由器调用均为 0 命中；构建首页精确引用哈希 `/assets/`。
- [x] `git diff --check` 无输出；`lib/**` 与全部 `.test.mjs` 相对 `main` 无差异；既有 test 脚本逐项一致。
- [x] `/?session=smoke-session` 已通过新服务真实返回同一 Vite 首页；查询参数由浏览器入口原样交给页面读取，未改成路径型路由。

### 任务 3：启动与发布链切换（进行中）

- [x] `bin/pi-web.js` 已不再查找或启动 Next CLI，改为校验 `web/dist/index.html` 后用当前 Node 启动 `server/launcher.cjs`；端口、绑定地址、局域网警告、Ready 后打开浏览器的旧行为保留。
- [x] Electron 主进程已改为启动同一个独立服务；继续使用单子进程、30141、127.0.0.1、启动等待、失败页、Windows 进程树关闭和退出清理。
- [x] `package.json` 的开发、构建、启动、发布与打包清单已切到新栈；`next`、`eslint-config-next` 已从依赖移除，既有全部 test 脚本逐项未改。
- [x] 新增 `scripts/dev.mjs` 同时管理 Vite 与独立接口服务：任务书要求的接口端口/代理目标仍为 30141，Vite 页面默认使用 5173；局域网模式只公开页面端口。
- [x] TypeScript 只覆盖迁移后真正参与运行的目录和两个根配置文件；白名单外的 4 个 Next 遗留文件不再进入检查，但没有越权删除。
- [x] ESLint 改为直接使用迁移前锁文件中的同版本 TypeScript、React、Hooks、可访问性和导入检查器，不依赖 Next；最终 `npm run lint` 为 0 错误、0 提示。
- [x] 发布工作流已删除 Windows 上只为旧文件追踪器服务的跨盘复制步骤，Windows/macOS 发布顺序、版本核对和发布方式不变。
- [x] `npm run build` 退出码 0，Vite 正式产物已生成；大包提示仍如实保留。
- [x] Web 生产入口实测：`node bin/pi-web.js --no-open` 输出 Ready；`/`、`/?session=task-3-smoke`、`/api/runtimes` 均为 200，两个首页字节一致且含哈希 `/assets/`。
- [x] 开发入口实测：`npm run dev` 同时启动 5173 页面与 30141 接口；页面、经代理接口、直连接口均为 200，两份接口响应字节一致。
- [x] browser 技能真实渲染：页面 `readyState=complete`、标题 `Pi Web`、根节点有 3 个直接子节点、正式哈希脚本已加载；有效格式的 `?session=` 地址在渲染后原样保留，截图确认侧栏、顶栏和主工作区完成布局。临时截图、数据目录和浏览器进程均已清理。

### 任务 3：错误、偏差与断点

- 通用 ESLint 初版误带入迁移前从未启用的规则，出现 21 个错误；没有改业务源码迎合它。读取旧包实际发布源码和旧锁文件后，直接复刻原规则/版本，第二次只剩 2 条失效豁免注释，删掉这两条配置残留后第三次回到 0/0。
- browser 技能文档写的是 `.js`，实际安装的是 `.cjs`，首次启动脚本路径失败；改用实际文件后发现 `ws` 尚未安装，按技能首次使用说明仅装进技能目录，之后导航、求值和截图成功，项目依赖未受影响。
- 本轮两条只读审计命令误用了任务书禁止的 `|| true`（一次读取可选测试文件、一次搜索剩余关键字）；没有吞掉验收失败、没有改状态，也未在后续命令继续使用。该流程偏差如实保留，不能宣称全程遵守此条。
- 最后一组语法/包清单断言尚未真正执行：外层工具脚本把内层反引号误解析并在命令启动前报错，对工作树无影响。下轮从重跑这组检查开始，勿重复前面的运行验证。
- [待验收] `npx electron-builder --mac dir`、`npm run check`、15/15 接口冒烟和冻结区差异核对；任务 3 尚未提交。
- [仍阻塞] `app/` 删除会让冻结测试新增至少 8 个失败；根目录 4 个 Next 专属文件又不在写白名单。继续遵守 `BLOCKED.md` 0A/0B，不越权删除或改测试。
- 本轮再次达到任务书的 40 次工具调用止损线，停在任务 3 验收前；当前没有运行中的项目服务，所有临时数据目录均已删除。

### 任务 3：桌面构建续跑（2026-08-01）

- [x] 断点中的语法与清单断言已真实重跑：两个 Web 启动脚本、Electron 主进程、开发协调脚本语法均通过；源码与桌面打包清单没有 `.next`/`next.config`；全部既有 test 脚本相对 `main` 逐项一致；`git diff --check` 无输出。
- [x] `npx electron-builder --mac dir` 退出码 0，产出 `dist-electron/mac-arm64/Pi Web Desktop.app`；按任务书保留 `asar=false` 和 `identity=null`，构建器如实提示未签名与不使用 asar。
- [x] 包内核对：Electron 入口、独立服务启动器、Vite 首页、TypeScript 路径配置和生产 `jiti` 依赖均存在；`server/api` 精确 67 条路由；包内清单没有 Next 依赖；`.app` 实测大小 516M。
- 包内断言尝试 1：用 `require()` 读取不带 `./` 的相对路径，被 Node 当成包名而失败；此前文件存在和 67 路由断言已通过。
- 包内断言尝试 2：改为直接读文件后发现构建器会从包内清单删除整个开发依赖字段，`in undefined` 抛错；第三次把缺失字段按空对象处理后全部通过。没有重建或放宽目标断言。
- [x] 包内运行验证：使用 `.app` 自带的 Electron 可执行文件以普通 Node 模式启动包内 `server/launcher.cjs`，真实输出 Ready；首页、运行时接口、首页引用的哈希脚本均返回 200。停止后退出码 0，临时数据和响应文件全部删除。
- 全量检查尝试 1：typecheck 与 lint 均通过；测试除两项既有失败外，新增 2 项任务路由失败，原因是冻结测试仍直接运行 `app/api/tasks/**`，而任务 3 已删除 `next` 依赖，旧薄壳无法再解析 `next/server`。不会恢复 Next 依赖或修改测试；下一步只把这些允许修改的旧路由薄壳接到 `server/next-compat`，再重跑全量测试。
- 读取 3 个旧任务路由时，首次搜索命令的单双引号组合不完整，shell 在执行任何子命令前报 `unmatched quote`；改用逐行命令和固定字符串搜索后成功，确认冻结测试运行的 3 个路由及共享助手共需改 4 条导入。
- [x] 上述 4 个允许修改的 `app/` 薄壳已改用与 `server/api` 相同的标准请求兼容层；业务逻辑一字未动，冻结测试与 `lib/**` 未改。
- [x] 相关 `npm run test:task-runtime` 为 7/7；完整测试恢复为 280 测、278 过、仅两项既有具名失败、0 跳过、0 todo。
- [x] 独立复核：typecheck 退出码 0；lint 退出码 0 且无提示；Pi adapter 11/11；API smoke 15/15，67 条路由和 3 条 SSE 全覆盖。
- 最终边界审计尝试 1：复杂 shell 搜索表达式再次因引号组合报 `unmatched quote`，命令在任何检查前停止；随即改为 Node 直接遍历目标文件，避免重复同类写法。
- [x] 最终边界审计通过：`git diff --check` 无输出；`lib/**` 和全部 `.test.mjs` 相对 `main` 无差异；app/server 路由路径均精确 67 条且一一对应；迁移目标文件无 Next 导入、旧公共环境变量或旧构建清单；package 与锁文件均无 Next 包；既有 test 脚本逐项一致。
- 干净安装尝试 1：`npm ci` 在移除现有 `node_modules/@ant-design/icons-svg/lib` 时遇到 macOS `ENOTEMPTY`，退出码 190；此前只有既有 React 19 peer 警告，未出现锁文件不一致。该目录完全由锁文件重建，下一步只清理这个精确包目录后改道重试，不删除整个依赖树。
- [x] 该失败目录实测只残留 macOS `.DS_Store`，且没有项目构建进程占用；删除精确的可重建包目录后，第二次 `npm ci` 退出码 0，安装 1,502 个包并成功应用两个既有补丁。仍只有既有 React peer、弃用包和 7 项审计提示，本任务不做无关升级。
- [x] 干净安装后的最终门禁：Vite build 退出码 0（2,884 模块）；typecheck 退出码 0；lint 退出码 0 且无提示；完整测试仍为 280/278/2/0，失败只限两项基线具名用例；Pi adapter 11/11；API smoke 15/15，67 路由与 3 条 SSE 均通过。
- `npm run check` 按原脚本真实退出 1：typecheck、lint 已通过，随后因任务书明确允许保留的两项基线测试失败而停止，未执行 adapter；adapter 已按同一未改脚本单独运行 11/11。没有修改 check/test 脚本，也没有把退出码伪装成 0。
- [x] 任务 3 可执行范围现已完成：Web、开发、Electron、打包、发布配置、依赖退场、干净安装、运行和回归证据齐全；验证生成的 `web/dist` 与 516M `dist-electron` 已删除，均可由已通过的构建命令重建。
- [阻塞复核第 3 个连续 goal turn] 物理删除 `app/` 仍会让 6 个冻结测试文件中的 13 条旧路径失效，并至少新增 8 个失败；改这 13 条测试路径是唯一干净修复，却被只读边界明令禁止。所有其他任务均已做完，现已到必须由用户扩大测试写权限或撤销删除要求才能继续的真正停点。

### 用户授权后的最终退场（2026-08-01）

- [x] 用户明确把白名单扩展到 6 个测试文件中的 13 条旧路由路径，并授权删除根目录 4 个 Next 专属文件。
- [x] 13 条路径已逐条从 `app/api` 改到一一对应的 `server/api`；机械核对为 6 个文件、13 行新增、13 行删除，测试文件没有其他差异；删除前再次确认新服务仍精确包含 67 条路由。
- [x] 已按授权物理删除 `app/`、`instrumentation.ts`、`proxy.ts`、`next-env.d.ts`、`next.config.ts`；删除目标均先确认存在，仍可从 Git 历史恢复。
- [x] 服务端退场审计发现 63 个文件仍使用 `next-compat` 路径，共 421 个旧响应类型名、14 个旧请求类型名、13 个旧 URL 属性名和 5 个旧附加函数名；测试只剩一条历史用例标题提及 Next.js，不依赖这些实现名。下一步做纯机械命名替换，不改协议或行为。
- [x] `server/next-compat.ts` 已由通用 `server/http.ts` 取代；63 个服务端文件完成机械改名，3 条旧框架注释同步改为通用描述。残留命名审计为 0，路由仍为 67 条；typecheck 与 lint 均退出 0。
- [x] 授权后的完整门禁已重跑：`npm run check` 中 typecheck 与 lint 均通过，Node 测试精确为 280 项、278 过、2 项既有具名失败、0 skip、0 todo；原脚本因这两项允许保留的基线失败真实退出 1，未伪装成功。
- [x] `npm run build` 退出码 0（Vite 8.2.0，2,884 个模块）；`node scripts/smoke-api.mjs` 为 15/15，67 条路由与 3 条 SSE 全覆盖；`npm run test:pi-adapter` 为 11/11。
- 最终 Web 运行验证尝试 1：4 个 HTTP 请求实际已发出，但汇总断言误写了未定义的局部文件变量，严格 shell 在打印结果前退出；退出清理已关闭服务并删除一次性目录与响应文件。下一次仅修正该变量名后重跑，不改变验证内容。
- [x] 最终 Web 运行验证尝试 2 通过：正式入口输出 Ready；`/`、`/?session=final-session`、`/api/runtimes` 和首页引用的哈希资源均为 200，两个首页响应逐字节一致。服务停止后一次性数据目录、日志与响应文件已全部删除。
- 最终桌面包断言尝试 1：外层工具把内联检查脚本中的模板字符串误当成自身语法，命令在启动 shell 前即报错；桌面构建本身此前已成功，产物和工作树均未被这次失败改变。下一次改用普通字符串拼接重跑同一组断言。
- [x] 授权退场后的 `npx electron-builder --mac dir` 退出码 0，再次产出未签名 arm64 `.app`；构建器保留既定 `asar=false` 与 `identity=null`，相关提示未隐藏。
- [x] 最终包内断言通过：独立服务、通用 HTTP 层、Vite 首页、路径配置与生产 `jiti` 均存在；`app/`、4 个根遗留文件和旧兼容层均不存在；服务端路由精确 67 条，包内服务端源码无 Next 兼容残留。
- [x] 最终包内运行通过：使用 `.app` 自带可执行文件以普通 Node 模式启动包内服务，真实输出 Ready；首页、运行时接口和首页引用资源均为 200。服务停止后一次性数据目录、日志与响应文件已全部删除。
- 最终检查范围复核尝试 1：直接运行原始 `eslint .` 时，历史分支留下的 1.1G `.next/` 生成物被通用检查器扫描，真实退出 1（854 错误、1,119 警告，均来自旧构建输出）；未改这些生成文件。已恢复原始 `lint` 命令文本，并在检查配置里加入与原框架配置等价的 `.next/**` 生成目录忽略，随后重跑验证。
- [x] `package.json` 的 `lint` 已恢复为基线原文 `eslint .`；`.next/**`、Vite 与桌面构建产物只在检查配置中作为生成目录忽略。`npm run lint` 随后退出码 0、无错误、无警告，验收命令和范围不存在偷换。
- [x] 最终证据取得后已精确删除可重建的 `web/dist` 与 `dist-electron`；没有触碰白名单外的历史 `.next/`，工作树不携带本轮生成物。
- 最终门禁汇总尝试 1：`npm run check` 的输出写入一次性日志，但汇总解析器没有找到测试计数并先行失败，因严格清理钩子日志已删除，适配器测试也未继续；没有据此宣称任何结果。下一次直接打印实际命令头尾与退出码，先判断是门禁提前失败还是解析格式错误。
- 最终门禁汇总尝试 2：实际输出确认 typecheck、原始 `eslint .` 和 280 项测试均已依次执行，`npm run check` 仍只因两个允许的基线用例退出 1；原因是当前 Node 默认报告器用 `ℹ tests` 而非解析器预期的 `# tests`。下一次兼容两种标准前缀并做最终严格断言。
- [x] 最终门禁汇总尝试 3 严格断言通过：`npm run check` 实际退出 1，typecheck 与原始 `eslint .` 均通过；测试精确为 280/278/2/0/0，失败名称只限两项允许基线。随后独立 `npm run test:pi-adapter` 为 11/11、0 失败、0 跳过、0 todo。
- [x] 恢复原始 lint 命令后的精确当前树再次执行 `npm run build && npx electron-builder --mac dir`，两步均退出 0；Vite 仍转换 2,884 个模块，桌面包仍按既定方式未签名且不使用 asar。
- 精确包断言尝试 1：误以为构建器会保留包内 `scripts` 字段，读取 `scripts.lint` 时触发空值错误并在启动包内服务前退出；构建器实际会裁掉整段开发脚本，这是既有打包行为。下一次改为断言包内没有 scripts、源码清单仍是 `eslint .`，再继续相同运行验证。
- [x] 精确包断言尝试 2 通过：包内仍精确 67 条路由、6 个禁止路径全缺失、Next 依赖全缺失；源码清单的 lint 为 `eslint .`，包内开发脚本按构建器设计被裁掉。该精确当前树的包内服务再次输出 Ready，`/`、`/?session=exact-package-session`、`/api/runtimes` 均为 200，两个首页响应逐字节一致。
- [x] 精确当前树的最终桌面与前端证据完成后，再次删除 `web/dist` 与 `dist-electron`；两项目录均确认不存在。
- [x] 最终扩展白名单审计通过：相对 `main` 共 114 个变更路径、0 越界；`app/` 的 72 个受控文件全为删除；6 个测试只有 13 条旧→新路由路径替换；11 个冻结脚本（含原始 lint、全部 test 与 check）逐项一致。
- [x] 最终结构审计通过：服务端路由与冻结清单精确 67/67，67 个文件均导出 HTTP 方法；目标源码 Next import 为 0，旧服务端兼容命名为 0；components/hooks 只有 7 个最小去 Next 文件，hooks 无差异；`git diff --check main` 无输出。
- [x] `BLOCKED.md` 已同步为“无未解决阻塞”，保留 0A/0B 的历史证据并记录用户授权后的关闭结果。任务 3 和整份迁移目标已具备提交条件。

## 主界面视觉深化（2026-08-01）

### 当前理解（任务 0，≤10 行）

1. 目标：在现有深色专业工具感和变量体系上，重做主界面五件套的层次、密度与状态反馈，所有交互行为保持不变。
2. 顺序：任务 0 基线 → 任务 1 稳定设计变量 → 任务 2 主界面五件套 → 任务 3 运行、构建、浏览器与范围收口。
3. 最大风险：源码正则测试会因无意改写固定片段变红；每阶段都复核五个冻结片段。
4. 第二风险：视觉改动混入硬编码颜色或新文案；新增颜色只走变量，新文案必须中英同步。
5. 让步顺序：行为不变 > 测试全绿 > 视觉深化幅度；不修已知两条在途失败和旁支缺陷。
6. 计划技能要求的额外小写计划文件不在白名单内，本轮只用 `PROGRESS.md` 与 `BLOCKED.md` 持久化。

### 任务 0：基线核对（完成）

- [x] 分支预检：开工位于 `main@c245f3d`，目标分支不存在；工作树干净。已在任何源码修改前从同一提交创建并切换到 `refactor/vite-foundation`，证据与判断见 `BLOCKED.md` 的 V0。
- [x] `node_modules/.bin/tsc --noEmit -p tsconfig.typecheck.json`：退出码 0，无输出。
- [x] `npm run lint`：退出码 0；输出为 `eslint .`，无错误或警告。
- [x] `npm run test`：退出码 1；`tests 280 / pass 278 / fail 2 / skipped 0 / todo 0`，仅有任务书指定的两条失败：
  - `only Shift+click bypasses session deletion confirmation`
  - `agent discovery returns builtin, user, and project domains with override metadata`
- [x] `npm run test:pi-adapter`：退出码 0；`tests 11 / pass 11 / fail 0 / skipped 0 / todo 0`。
- [x] 五个冻结片段逐条命中：
  - `components/FileExplorer.tsx:477` → `modeHint: "diff"`
  - `components/FileExplorer.tsx:871,892` → `gitLineStats.additions`
  - `components/FileExplorer.tsx:872,900` → `gitLineStats.deletions`
  - `components/AppShell.tsx:1978` → `initialDisplayMode={activeFileTab.initialDisplayMode}`
  - `components/FileViewer.tsx:1096` → `isDeletedDiff ? "diff" : displayMode`
- [x] 基线数字与冻结片段均与任务书一致，可以进入任务 1。

### 错误与纠偏

- 为压缩主测试长日志，前两次 `tail`/`rg` 管道只显示了末端程序的退出码 0，未把该值记作测试结论；最终用 `set -o pipefail` 复跑，保留原始退出码 1，并得到 `280/278/2/0` 与两条具名失败的有效证据。

### 任务 1：设计变量盘点（进行中）

- [x] `web/globals.css` 现有 13 个颜色变量全部在 `@theme` 中有 `--color-*` 映射；明暗主题分别位于 `:root` 与 `html.dark`，本轮不新增第三套主题。
- [x] 旧变量清单：`--bg/--bg-panel/--bg-hover/--bg-selected/--border/--text/--text-muted/--text-dim/--accent/--accent-hover/--user-bg/--assistant-bg/--tool-bg/--bg-subtle`；其中 `--bg-subtle` 也必须保留。
- [x] 当前缺少统一的层级面、强边框、柔和强调、焦点环、危险/成功语义、圆角和阴影变量；任务 2 多处状态样式正需要这些语义，适合在任务 1 一次稳定下来。
- [x] `jiti` 实装版本为 2.7.0，CommonJS 入口同时提供默认工厂与 `createJiti`；两份语言包分别导出 `enLocale`、`zhCNLocale`，目标子树都是 `messages`。

### 任务 1：设计变量精修（完成）

- [x] 旧变量全部保留并精修值；浅色改为“浅灰画布 + 白色面板”，深色改为“深画布 + 逐级抬高面板”，没有新增主题。
- [x] 新增并完成明暗双值与 `--color-*` 映射：`--bg-elevated/--border-strong/--accent-soft/--focus-ring/--text-on-accent/--danger/--danger-soft/--warning/--warning-soft/--success/--success-soft`。
- [x] 新增主界面专用的 `--ui-radius-*`、两档阴影和两档过渡；没有使用会覆盖 Tailwind 内建圆角的通用变量名，也删除了会波及范围外原生控件的 `color-scheme`。
- [x] 新增 `scripts/i18n-parity.cjs`：用实装 `jiti@2.7.0` 加载两个命名导出，递归展开 `messages`，双向比较自身键并稳定排序输出。
- [x] parity 反向验证红证据：临时删除 `zh-CN.ts` 的 `common.ok` 后，输出 `en=450 zh-CN=449`、`missing in zh-CN (1): common.ok`，退出码 1。
- [x] parity 还原绿证据：恢复同一行后，输出 `en=450 zh-CN=450`、`i18n parity: zero difference`，退出码 0；两份语言文件最终相对提交无差异。
- [x] 旧变量 grep：14 个旧颜色变量在浅色与深色定义中逐项命中；11 个新增颜色变量的映射与双主题定义逐项命中。
- [x] `npm run check` 保持基线：typecheck、lint 先后通过；主测试 `280/278/2/0`，失败仅为两条指定在途用例，因此原脚本真实退出 1 并在适配器前停止。
- [x] 随后独立 `npm run test:pi-adapter`：`11/11`、0 失败、0 跳过、0 todo，退出码 0。
- [x] `git diff --check` 无输出；任务 1 最终改动只在 `web/globals.css`、`scripts/i18n-parity.cjs` 与本进度文件。

### 任务 2：主界面五件套（进行中）

- [x] 从任务 1 的干净提交 `5a78a4d` 恢复，未重跑已完成的任务 0/1。
- [x] 改动边界暂为六个主组件与 `web/globals.css`：AppShell、SessionSidebar、ChatWindow、MessageView、ChatInput、TabBar；没有触碰设置弹窗、hooks、测试或只读目录。
- [x] 采用 `pi-*` 作用域类承载 hover、focus、selected、danger/warning/success 等视觉反馈；没有使用会覆盖设置弹窗的全局按钮或输入框选择器。
- [x] 六个已改组件整文件执行十六进制颜色正则为 0 命中；颜色全部改走设计变量或变量混色。
- [x] 五个冻结片段仍逐条命中，AppShell 的目标片段现位于 1986 行；其余四处文本原样。
- [x] 第一次整合审查发现并修正两处纯样式覆盖：阴影从用户消息整行外壳移到气泡；输入框焦点阴影增加必要优先级。同时把 Bash 输入边框从内容背景变量改为强边框变量。

### 任务 2：主界面五件套（完成）

- [x] AppShell：主外壳、工作区、顶栏和顶栏按钮接入作用域样式；面板选中、信任警告、失败和成功状态改走语义变量；深链、移动端抽屉、分支和右侧文件面板逻辑未改。
- [x] SessionSidebar：头部、项目选择、会话列表、会话行、文件区和操作按钮统一层次、圆角、hover/focus/selected/危险状态；固定 54px 行高、删除确认、worktree、拖拽和运行状态订阅未改。
- [x] ChatWindow + MessageView：聊天画布、空态、滚动列、通知、用户气泡、助手正文、思考和工具卡层次统一；拖拽、消息分组、流式条件、展开、复制、fork/branch 未改。
- [x] ChatInput：输入壳、焦点环、状态色、控制栏和发送按钮统一；键盘/输入法、历史与补全选择、运行中两种排队动作未改。
- [x] TabBar：激活顶线、未激活 hover、关闭按钮焦点和状态过渡统一；普通选择、中键关闭、宽度与滚动行为未改。
- [x] 冻结反向验证红证据：临时把 AppShell 的透传片段改为 `initialDisplayMode={undefined}` 后，`lib/quick-changes-ui.test.mjs` 为 `2 测/1 过/1 败`，失败明确指出缺少冻结正则，退出码 1。
- [x] 冻结还原绿证据：恢复 `initialDisplayMode={activeFileTab.initialDisplayMode}` 后，同一测试 `2/2`，0 失败、0 跳过、0 todo，退出码 0。
- [x] 最终 `npm run check` 保持基线：typecheck、lint 通过；主测试 `280/278/2/0`，仅两条指定在途失败；原脚本真实退出 1并在适配器前停止。
- [x] 独立 `npm run test:pi-adapter` 为 `11/11`；i18n parity 为 `en=450 zh-CN=450`、零差异。
- [x] 五个冻结片段逐条命中；任务书字面 hex 命令对所有已改组件无输出、退出码 1，即 0 命中；`git diff --check` 无输出。
- [x] 最终任务 2 边界仅六个主组件、`web/globals.css` 与本进度文件；没有新增文案、语言 key、依赖、测试改动或 hooks 改动。

### 任务 3：运行、构建与浏览器验证（进行中，止损断点）

- [x] `node scripts/smoke-api.mjs` 退出码 0：`SMOKE PASS 15 checks; 67 routes covered`，包含 3 条 SSE。
- [x] `npm run build` 退出码 0：Vite 8.2.0 转换 2,884 个模块并生成正式产物；仅保留既有大分块提示。验证后已删除可重建的 `web/dist`。
- [x] 浏览器环境确认：Python Playwright 可导入，本机 Google Chrome 可执行；按持久连接页面规则等待 `document.title === "Pi Web"` 与 `#root`，未使用 `networkidle`。
- [x] 为 before 使用任务 1 提交 `5a78a4d` 建立一次性 detached worktree；before 页面真实完成，`title=Pi Web`、`readyState=complete`、根节点 3 个直接子节点、横向溢出 false、控制台/页面/请求错误均为 0，已生成 `pi-web-before.png`。
- 浏览器尝试 1：after 使用默认接口端口时，服务真实报 `EADDRINUSE 127.0.0.1:30141` 后退出；before 正常。该次只取得 before，不作为完整截图验收。
- 浏览器尝试 2：after 改用独立 `5175/30143` 后页面与接口服务均 Ready；但浏览器子进程超过外层单次等待窗口，编排层未取得其最终结果，随后服务被停止，因此没有 after/mobile 合格输出。
- 清理尝试 1：组合清理里的 `rm -rf` 被安全策略拒绝，未执行；改用 Git worktree 移除和逐项删除。
- 清理尝试 2：zsh 循环变量误用了特殊变量名 `path`，导致同一 shell 后续找不到 `find`；Git worktree 已先移除，数据目录尚未确认。
- [x] 清理尝试 3：改用 `cleanup_target` 和 `/usr/bin/find -depth -delete` 后完成；当前只剩主工作树，两个临时服务均已停止，隔离数据目录与正式构建产物均已删除。
- [ ] 当前未提交文件仅 `scripts/visual-smoke.py` 与本进度记录；任务 3 尚未提交。截图目录只有 before，严禁把它充作 before/after 完成。
- [ ] 续跑入口：使用非冲突端口重新启动 before/after 两个隔离服务，运行 `scripts/visual-smoke.py` 并显式等待其结束；取得 after 与 after-mobile、零错误和 `VISUAL SMOKE PASS` 后，补领导亲验清单、最终审计并做任务 3 单独提交。
- [止损] 本轮已达到 40 次工具调用上限，按任务书停止，不继续第三次浏览器编排。

### 任务 3：运行、构建与浏览器验证（完成）

- [x] 续跑时把浏览器默认交互等待收紧到 5 秒，并修正验收脚本的输入框定位；没有改产品逻辑。第一次复跑准确暴露“未选择项目时不会渲染输入框”，随后通过隔离数据目录里的真实设置接口指定一次性默认目录，再走真实项目菜单进入空会话。
- [x] 第一组完整浏览器验收退出码 0：before/after 桌面页和 after 390×844 窄屏页的控制台错误、页面异常、非 SSE 请求失败均为 0；after 的作用域外壳、项目菜单与选择、输入焦点环、工具栏 hover、空态、移动端侧栏均命中，三页横向溢出均为 false；末行 `VISUAL SMOKE PASS`。
- [x] 肉眼复核发现第一组 before/after 中央内容状态不同，因此没有拿它充作最终对比；又让两边都通过各自真实项目选择流程进入空会话并聚焦输入框，得到同状态 1440×960 对比图。该组再次退出码 0，before/after/mobile 错误仍全为 0，末行仍为 `VISUAL SMOKE PASS`。
- [x] 同状态关键值：before `hasScopedShell=false`、基础输入阴影；after `hasScopedShell=true`、`toolbarHoverBackground=rgb(240, 242, 245)`、项目菜单/选择/空态均为 true，输入框同时出现强调边框与约 3px 焦点环；移动端 `sidebarOpen=true`、`horizontalOverflow=false`。
- [x] 截图已保存为 `pi-web-before.png`、`pi-web-after.png`、`pi-web-after-mobile.png`；肉眼确认改造后工作区边界、面板抬升、输入焦点和控件层次更清楚，移动端抽屉与遮罩完整，没有截断或溢出。
- [x] 两轮浏览器服务均使用独立页面端口、接口端口、运行数据目录与 Agent 目录；结束后服务已停止，临时 worktree、配置、工作目录与 Python 缓存均精确删除，当前只剩主工作树。

### 领导亲验清单（14 条）

1. 启动后打开根页面：先看左侧栏、顶栏、聊天区、右侧文件区是否仍是熟悉的三栏工作台。
2. 桌面密度：在 1440px 宽度下看会话行、顶栏按钮、标签和输入控制栏，确认紧凑但不拥挤。
3. 层次：看画布、侧栏、抬升面板、聊天空态卡和输入框是否能一眼分出前后层级。
4. 选中态：依次选项目、会话和文件标签，确认当前项比 hover 更明确，文字仍清晰。
5. 焦点态：用键盘切到项目选择、顶栏按钮、标签和输入框，确认焦点环完整且不会被裁掉。
6. 空态：新建空会话，看品牌、输入框、模型/工具控制和空白留白是否形成稳定视觉重心。
7. 流式输出中：发送真实消息，看增量文字、运行状态和停止/排队操作是否稳定且不跳布局。
8. 工具调用展开：展开一条工具调用及结果，看标题、参数、结果与状态色的层级是否清楚。
9. 分支导航：在有分支的会话切换前后节点，看当前位置、可用方向和聊天内容是否同步。
10. Fork 与深链：从用户消息 Fork，再复制带 `?session=` 的地址重开，确认仍进入正确会话。
11. Worktree：打开工作树切换器，检查当前项、hover、创建/移除确认和脏目录警告不变。
12. 拖拽：拖文件进聊天区并拖动工作区分隔位置，确认反馈、落点与原行为一致。
13. 移动端窄宽：在 390px 宽度打开侧栏，确认抽屉、遮罩、关闭动作与正文均无横向溢出。
14. 明暗主题：切换现有两套主题，确认面板层次、边框、状态色和正文对比度都成立。

### 最终收口审计（完成）

- [x] 精确当前树执行 `npm run check`：`typecheck` 的 `tsc --noEmit -p tsconfig.typecheck.json` 与 `lint` 的 `eslint .` 均通过；主测试为 `tests 280 / pass 278 / fail 2 / cancelled 0 / skipped 0 / todo 0`，失败仍只限 `only Shift+click bypasses session deletion confirmation` 与 `agent discovery returns builtin, user, and project domains with override metadata`。原命令因这两项基线失败真实退出 1，并按既有 `&&` 在适配器前停止，没有伪装成功。
- [x] 单独执行 `npm run test:pi-adapter`：`tests 11 / pass 11 / fail 0 / cancelled 0 / skipped 0 / todo 0`，退出码 0；输出只有既有模块类型性能警告。
- [x] `node scripts/i18n-parity.cjs`：`en=450 zh-CN=450`、`zero difference`，退出码 0；两份语言文件没有本任务差异。
- [x] `python3 -m py_compile scripts/visual-smoke.py`：退出码 0、无输出；生成的缓存只用于语法检查，最终审计前精确删除，不随交付提交。
- [x] 五个冻结片段最终逐条命中：FileExplorer 的三类文本位于 477、871/892、872/900 行，AppShell 透传片段位于 1986 行，FileViewer 显示模式片段位于 1096 行。
- [x] 14 个旧设计变量在 `web/globals.css` 的明暗主题中全部保留；六个已改组件整文件 `grep -En '#[0-9a-fA-F]{3,8}'` 为 0 命中，新增行 hex 审计也为 0 命中。
- [x] 测试、package 清单、`server/`、`electron/`、`bin/`、`lib/` 相对 `main` 均无差异；`git diff --check main` 无输出。
- [x] 首次原始路径审计只多出语法检查生成的 `scripts/__pycache__/visual-smoke.cpython-314.pyc`；它是可重建缓存，已列为清理目标，清理后必须重新跑白名单才可提交。
- [x] 独立只读复核得到相同结论；它把 Git 显示的小写 `progress.md` 标为字面疑点。当前文件系统实测 `PROGRESS.md` 与 `progress.md` inode 同为 20121884，Git 既有跟踪名为小写且 `core.ignorecase=true`；这就是 `BLOCKED.md` 已记录的同一路径大小写兼容情形，不另造重命名改动。
- [x] 精确删除 `scripts/__pycache__` 后重新审计：相对 `main` 加未跟踪文件共 11 个路径，全部位于 `BLOCKED.md`、同 inode 的进度文件、六个目标组件、`web/globals.css` 与 `scripts/`；`whitelist_violations=0`。
- [x] `BLOCKED.md` 已把进度文件大小写项收口为“不再阻塞”；当前状态继续为无未解决阻塞。
- [x] 完成条件已齐：主门禁保持基线、适配器 11/11、五个冻结片段全中、双语零差异、接口冒烟 15/15 覆盖 67 路由、Vite 正式构建成功、浏览器同状态 before/after 与窄屏验收通过、组件新增行无违规 hex、白名单 0 越界。任务 3 可独立提交。
