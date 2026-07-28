# pi-web 全栈架构评估报告

- 评估日期：2026-07-28（下方 8 条结论保留 P0 实施前的实测快照）
- 评估方式：评估阶段只读取证；每条原始结论附可复跑命令或 file:line
- 基线健康度：`node_modules/.bin/tsc --noEmit` 退出码 0；`npm run lint` 无告警退出码 0
- 实施状态：P0、P1、P2 路线图已于 2026-07-28 完成；15 秒对账轮询按保守策略继续保留
- 阅读提示：原始行号和数量用于复现改造前的判断，当前现状以下方实施结果为准

## 路线图实施状态总览（2026-07-28）

| 原结论 | 当前状态 | 实测结果 |
|---|---|---|
| 问题 1：前端状态边界过大 | P1-1/P1-2/P1-3/P2-3 已完成 | 三类会话子状态和三处大组件子面板已拆；Zustand 只承载 4 个导航/工作区字段，5 个跨层中转参数已删除 |
| 问题 2：界面层请求重复 | 主要重复已收拢 | 三个优先组件 25 处 `fetch` 全部迁移；`components/` + `hooks/` 总数 59→34 |
| 问题 3：后端协调器职责过重 | P2-1 已解决主要职责集中 | 主文件 1,259→659 行，命令分支 25→8；注册表、生命周期、扩展界面和普通命令均有独立模块/测试 |
| 问题 4：应用服务层缺边界守卫 | 已解决 | 新增唯一例外白名单与 Pi SDK 禁止规则，边界测试 8/8 通过 |
| 问题 5：三块纯逻辑无测试 | 已解决 | 抽成三个独立模块并新增 8 项行为测试；顺带锁定循环父子会话不丢失 |

P0 新增通用 JSON 请求工具及 6 项行为测试，并让现有 `/api/agent` 请求工具复用它。最终验收：

```
$ rg -n "fetch\(" components hooks | wc -l
34
$ rg -n "fetch\(" components/SessionSidebar.tsx components/SkillsConfig.tsx components/ModelsConfig.tsx
（无输出）
$ npm test
tests 188 / pass 188 / fail 0
$ npm run typecheck
退出码 0
$ npm run lint
退出码 0，无告警
```

没有安装依赖、没有运行 `next build`、没有重启开发服务。自动化回归已完成；尚未做浏览器内人工点选冒烟测试。

## P1-1 实施结果（2026-07-28）

会话主钩子已按职责拆成四块：主钩子继续管理消息、实时连接和断线对账；另外三个独立钩子分别管理模型与工具、扩展界面和通知队列。

| 指标 | 改造前 | P1-1 后 |
|---|---:|---:|
| `hooks/useAgentSession.ts` 行数 | 1,651 | 1,425 |
| 主钩子直接 `useState` | 37 | 22 |
| 对外返回成员 | 71 | 71（兼容调用方） |
| 全量测试 | 188 | 197 |

P1-1 新增 9 项纯状态与选择逻辑测试；实时通道的 15 秒对账、页面重新可见/网络恢复触发、单调运行编号和四处迟到结果守卫均保留在主钩子。最终验收：

```
$ npm test
tests 197 / pass 197 / fail 0
$ npm run typecheck
退出码 0
$ npm run lint
退出码 0，无告警
$ node -e 'const fs=require("fs"),ts=require("typescript");const p="hooks/useAgentSession.ts",s=fs.readFileSync(p,"utf8"),f=ts.createSourceFile(p,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let n=0;function v(x){if(ts.isReturnStatement(x)&&x.expression&&ts.isObjectLiteralExpression(x.expression))n=Math.max(n,x.expression.properties.length);ts.forEachChild(x,v)}v(f);console.log(`return_members=${n}`)'
return_members=71
```

开发服务未运行，`curl http://127.0.0.1:30141` 返回连接失败；按规则未替用户启动或重启服务，因此浏览器内人工冒烟仍标记为未验证。

## P1-3 实施结果（2026-07-28）

三处大组件按“父级保留跨面板编排、子组件自管局部交互”的边界完成物理拆分：

| 主文件 | P1-3 前 | P1-3 后 | 迁出内容 |
|---|---:|---:|---|
| `components/ModelsConfig.tsx` | 1,589 行 / 21 处 `useState` | 968 行 / 12 处 | 表单控件、连接测试、OAuth、API Key |
| `components/ChatInput.tsx` | 2,160 行 / 18 处 `useState` | 1,856 行 / 16 处 | 附件预览、斜杠命令菜单、模型选择器 |
| `components/SessionSidebar.tsx` | 1,905 行 / 38 处 `useState` | 1,457 行 / 30 处 | 工作树创建/删除/脏目录确认、路径标签、下拉动画 |

工作树加载快照仍留在侧栏主文件，因为会话项目归组依赖它；创建、删除与弹层状态则归独立工作树组件。模型授权持续推送仍留在授权面板，普通请求继续走统一请求工具。输入主文件仍负责发送、草稿、快捷键和文件补全，没有改实时消息链路。

```
$ npm test
tests 197 / pass 197 / fail 0
$ npm run typecheck
退出码 0
$ npm run lint
退出码 0，无告警
$ git diff --check
（无输出）
```

P1-3 当时没有新增依赖、没有运行 `next build`、没有启动或重启开发服务；最终综合浏览器冒烟已在 P1-2/P2-3 收口阶段补齐。

## P2 实施结果（2026-07-28）

P2-1 采用“公开入口不变、内部职责搬迁”的方式拆协调器，12 个既有消费者无需改入口：

| 指标 | 改造前 | P2-1 后 |
|---|---:|---:|
| `lib/rpc-manager.ts` 行数 | 1,259 | 659 |
| `send()` 命令分支 | 25 | 8 |
| 独立职责模块 | 0 | 4（注册表/启动锁、操作生命周期、扩展界面、普通命令表） |

复杂的提示、终止、分叉、树导航、压缩和终端生命周期仍留在协调器；17 类普通配置/查询命令进入显式处理表。`globalThis` 会话注册表、并发启动锁、热重载和 fork 后销毁语义保持不变。

P2-2 给已持久化事件接上浏览器原生 SSE 序号：首次连接以 journal 当前水位为起点；自动重连读取 `Last-Event-ID`，手工重建连接带 `?since=`；服务端只按当前 Task/Run 补发 durable 事件。消息正文和流式片段仍不写 journal，断线正文继续从当前会话快照恢复。15 秒轮询、页面重新可见/网络恢复触发和原迟到结果守卫全部保留。

```
$ wc -l lib/rpc-manager.ts
659 lib/rpc-manager.ts
$ rg -n '^\s*case "' lib/rpc-manager.ts | wc -l
8
$ npm test
tests 211 / pass 211 / fail 0
$ npm run typecheck
退出码 0
$ npm run lint
退出码 0，无告警
$ git diff --check
（无输出）
```

P2-2 当时只完成自动化；最终收口阶段已用真实服务关闭/恢复验证运行状态 SSE 会自动重连，但未在活跃生成过程中验证逐条 durable 补发，因此 15 秒轮询仍不减少。消息正文逐片段回放经用户裁决明确不做。

## P1-2 / P2-3 实施结果（2026-07-28）

用户选择 Zustand，最终锁定 `zustand@5.0.12`（`package.json:115-127`）。共享 store 只放选中会话、新会话目录、当前工作目录、项目根 4 个字段（`lib/workspace-store.ts:8-31`），会话选择与新建会话采用原子动作（`lib/workspace-store.ts:53-67`）。工作树完整快照、未读集合、表单输入、弹窗开关和消息流继续留在各自组件，没有为了使用状态库而扩大共享面。

`AppShell`、`SessionSidebar`、`ChatWindow` 均改为单字段 selector（`components/AppShell.tsx:90-98`、`components/SessionSidebar.tsx:188-203`、`components/ChatWindow.tsx:173-177`）；侧栏删除选中会话编号、选中目录、目录变更回调 3 个顶层参数，聊天视图删除会话对象和新会话目录 2 个中转参数。会话选择回调仍保留，因为它还负责地址栏、移动端抽屉和聊天视图重置。`lib/architecture-boundary.test.mjs:111-135` 会阻止局部状态进入共享 store 或旧中转参数回流。

```
$ npm test
tests 215 / pass 215 / fail 0
$ npm run typecheck
退出码 0
$ npm run lint
退出码 0，无告警
$ git diff --check
（无输出）
```

浏览器使用独立临时 `PI_WEB_DATA_DIR` 实测，避免碰触本机 schema 4 的用户数据库（当前代码只支持 schema 3）。首页 HTTP 200，输入框可聚焦，项目下拉可打开，模型/技能/插件/MCP 四个弹层均可开关；测试目录不是 Git 根，工作树入口按设计只读。真实关闭开发服务再恢复后，`/api/agent/running/events` 请求数从 1 增为 2；恢复后控制台错误、页面脚本错误、非预期请求失败均为 0。临时服务、数据库、脚本和截图已删除。

用户同时裁决：`doctor` 接口直连 persistence 维持现状；application services 的 Node `crypto` 维持现状；不做流式正文逐片段回放；`lib/subagent/` 本地空目录已删除。`BLOCKED.md` 当前为“无”。

---

## 评估结论清单（P0 实施前：5 问题 + 3 亮点，共 8 条）

### 问题 1【高】前端缺少跨组件状态边界，状态与接口面过大

**现象**：全仓 `components/` + `hooks/` 没有任何 `createContext`/`useContext`，`package.json` 也无 zustand/redux/jotai 等状态库；跨组件状态主要靠 props + 巨型 hook 串联。

**证据**（2026-07-28 实测）：

```
$ grep -rn "createContext\|useContext" components hooks | grep -v test | head
（无输出）
$ grep -i "zustand\|redux\|jotai\|valtio\|mobx" package.json
（无输出）
$ grep -c useState components/SessionSidebar.tsx   → 38
$ grep -c useEffect components/SessionSidebar.tsx  → 15
$ grep -c useState hooks/useAgentSession.ts        → 37
$ grep -c useState components/ModelsConfig.tsx     → 21
$ grep -c useState components/AppShell.tsx         → 34
```

接口面同样过大：`hooks/useAgentSession.ts:1626-1649` 的 return 块返回 71 个成员（state/refs/actions 三类混杂，使用 TypeScript AST 实测）；`components/ChatInput.tsx:25-63` 的 `interface Props` 有 36 个字段；`components/ChatWindow.tsx:174` 的函数签名挂 15 个 props，其中 9 个是回调。`components/ModelsConfig.tsx:1276-1284` 的顶层配置界面另有 9 组状态，且同文件共有 10 处 fetch。

**依据**：38 个 useState 的组件中，跨领域状态联动要手工维护依赖链；71 个返回成员的 hook 让局部测试和局部替换成本很高。这是迭代速度的最大结构性瓶颈。

---

### 问题 2【中】59 处 fetch 散在界面层，公共 client 覆盖仅 2 个文件

**现象**：多处复制「fetch → 解析 JSON → 判断 HTTP/业务错误 → 写入界面错误状态」样板。仓库已有 `lib/agent-client.ts`，但只覆盖 `/api/agent` 一类命令，且仅 2 个文件使用。

**证据**：

```
$ grep -rn "fetch(" components hooks | wc -l        → 59
$ grep -rln "agent-client" components hooks          → components/PluginsConfig.tsx、hooks/useAgentSession.ts（仅 2 处）
```

典型重复对照：`components/SessionSidebar.tsx:560-576`（/api/cwd/validate）与 `components/SessionSidebar.tsx:607-625`（/api/worktrees）是同构代码，仅 URL、请求体和 setter 不同；`components/SkillsConfig.tsx:368/395/697/731/770/811` 六处、`components/ModelsConfig.tsx:546/785/794/814/988/1013/1287/1294/1301/1393` 十处也各自处理请求。前两处还分别手写内联响应类型，响应契约没有单一来源。

**依据**：错误处理语义不统一（有的 `catch {}` 静默吞掉，如 `components/SessionSidebar.tsx:597` 的 `// ignore`；有的弹错误），改一处 API 响应格式要改 N 个组件。

**P0 后状态**：三个优先组件已改走 `lib/api-client.ts`，共享响应契约集中到 `lib/api-types.ts`；其余 34 处普通或特殊请求留待后续按域迁移。

---

### 问题 3【中】rpc-manager 已成 god class，超出其文档化职责

**现象**：`AGENTS.md:184` 声明 rpc-manager 「remains the registry + API coordinator」，但实测 1259 行的文件里 `AgentSessionWrapper`（`lib/rpc-manager.ts:112`）有 18 个私有字段，承担：事件总线、extension UI 生命周期（custom UI/widget/status 三块 Map）、MCP 状态缓存、空闲销毁定时器、operation 生命周期跟踪、强制空 systemPrompt、运行会话 pub/sub。其中 `send()` 单方法横跨 `lib/rpc-manager.ts:379-771`（393 行），内含 25 个 `case` 的命令分发 switch。

**证据**：

```
$ awk 'NR>=379 && NR<=771' lib/rpc-manager.ts | grep -c 'case "'   → 25
$ grep -rn 'from "@/lib/rpc-manager"' app lib --include="*.ts" | grep -v test | wc -l   → 12（11 个 API route + 1 个 server bridge）
```

**依据**：extension UI 相关代码（`lib/rpc-manager.ts:787-1112`，约 326 行）与 session registry 无内在关联；25-case switch 意味着每加一个 RuntimeCommand 都要改这个 1259 行文件。12 个服务端模块直接 import 同一入口，入口背后维护全局可变注册表（`globalThis.__piSessions`）；现有 `lib/rpc-manager.test.mjs` 也以整个模块为测试边界。

---

### 问题 4【中】架构边界测试只守了一半：application/services 无守卫

**现象**：`lib/architecture-boundary.test.mjs` 只 walk 了 `lib/kernel` 和 `lib/application/ports`，没有覆盖 `lib/application/services`。`lib/application/services/pi-session-reconciler.ts:5` import `@/lib/adapters/pi/pi-task-projector` 是 `AGENTS.md:89` 明文批准的例外（「唯一同步入口」），但如果明天第二个 service 也 import adapters 甚至 pi SDK，现有测试不会拦截。

**证据**：

```
$ grep -n "portsDir\|servicesDir\|application" lib/architecture-boundary.test.mjs
36:test("application ports stay free of pi/react/next/sqlite imports", async () => {
37:  const portsDir = path.join(repoRoot, "lib", "application", "ports");   ← 只有 ports
38:  const files = await walk(portsDir);
$ grep -rn "from \"@/lib/adapters" lib/application --include="*.ts"
lib/application/services/pi-session-reconciler.ts:5:import { getPiRunId, getPiTaskId } from "@/lib/adapters/pi/pi-task-projector";
```

**依据**：分层纪律目前靠评审自觉，例外一旦开了口，没有自动化手段防止例外扩散。另外 `lib/application/services/evaluation-service.ts:1`、`lib/application/services/task-service.ts:1`、`lib/application/services/capability-service.ts:1` import Node `crypto`——AGENTS.md 未禁止 application 层用 Node 模块，不构成违规；用户已裁决维持现状，不再作为待办。

**P0 后状态**：已在 `lib/architecture-boundary.test.mjs` 加入应用服务层守卫；只准 `pi-session-reconciler.ts` 引用指定 Pi 投影适配器，其他适配器或 Pi SDK 直连会让测试失败。

---

### 问题 5【低】纯业务逻辑埋在组件文件里且无测试

**现象**：`components/SessionSidebar.tsx:185` 的 `buildSessionTree()`（会话树构建，46 行纯逻辑）、`components/ChatInput.tsx:133` 的 `slashMatchRank()`（斜杠命令排序），以及 `components/ModelsConfig.tsx:490-503` 的模型兼容配置转换，都是无副作用逻辑，但活在组件文件里，无针对性测试。

**证据**：

```
$ rg -l "buildSessionTree" . -g "*.test.mjs" -g "!node_modules/**"    →（无输出，未测试）
$ rg -l "slashMatchRank" . -g "*.test.mjs" -g "!node_modules/**"      →（无输出，未测试）
$ rg -l "setDeepseekCompat" . -g "*.test.mjs" -g "!node_modules/**"   →（无输出，未测试）
```

**依据**：会话树构建是 fork/父子关系的核心展示逻辑，错了用户直接看到错误的会话层级；这类逻辑恰恰最容易抽测（对照亮点 2 的做法）。

**P0 后状态**：三块逻辑已分别移至 `lib/session-list-tree.ts`、`lib/slash-command-ranking.ts`、`lib/model-config.ts`，8 项测试覆盖关键分支。抽取过程中发现并修复了两个现存会话互相指向时会从侧栏消失的问题。

---

### 亮点 1 分层纪律整体守住，且有自动化守卫锁定

**证据**（2026-07-28 实测）：

```
$ rg -n -P '^import .* from ["\x27](?!\.)' lib/kernel                                →（无输出）
$ grep -rn "lib/persistence\|persistence/" components hooks                           →（无输出）
$ grep -n "api/tasks/resolve\|projectPiSession" components/AppShell.tsx
595:      void fetch(`/api/tasks/resolve?...`)          ← 走 task API
（无 projectPiSession）                               ← 未客户端投影
```

且 `lib/architecture-boundary.test.mjs:71-75` 用断言把「AppShell 必须走 /api/tasks/resolve、禁止 projectPiSession」锁进测试，回归会被 CI 拦住。基线疑点中 `lib/application/services/runtime-registry.ts:6` 的 "adapters" 经查只是私有 Map 字段名、并非 import adapters 模块——**证伪，不计问题**。`app/api/doctor/route.ts:3` 直接 import `@/lib/persistence`，因 doctor 是服务端 route，不违反 `AGENTS.md:85`「persistence 不被 client 代码引用」的明文规则——**判定为合规，不计问题**。

---

### 亮点 2 纯函数抽取 + 测试的正面样板已经存在

`components/MessageView.tsx:8` import `parseUnifiedPatch`（来自 `lib/patch.ts`，有 `lib/patch.test.mjs`），`components/MessageView.tsx:6-7` 同样引用有测试的 `lib/compaction-summary`、`lib/message-display`。说明团队已经掌握「组件只渲染、逻辑进 lib 并配 .test.mjs」的正确做法——问题 5 只是没推全。全仓 44 个 *.test.mjs（node:test，零额外依赖），测试基建现成。

```
$ find . -path ./node_modules -prune -o -name "*.test.*" -print | wc -l   → 44
$ head -2 lib/patch.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
```

---

### 亮点 3 SSE 对账复杂度是有意设计，不是过度工程

**现象**：`hooks/useAgentSession.ts` 同时存在 SSE 主通道 + 15s 轮询（`hooks/useAgentSession.ts:163`）+ `visibilitychange`/`online` 触发（`hooks/useAgentSession.ts:864-881`）三条补偿通道，并用 `promptRunIdRef` 单调 run id 在 4 处守卫丢弃迟到结果（`hooks/useAgentSession.ts:755/759/776/837`），注释明确写出防「ghost streaming bubble」（`hooks/useAgentSession.ts:937`）。

**判定**：当前复杂度必要——`app/api/agent/[id]/events/route.ts`（全文 78 行）不支持 Last-Event-ID 断线续传，SSE 丢事件后客户端只能靠对账兜底；AGENTS.md 也记录了该机制修的是「后台标签页丢 agent_end」的真实 bug。**但这是症状治疗**：`lib/application/ports/event-journal.ts:3-17` 已有序号查询，`lib/persistence/sqlite-event-journal.ts:183-195` 已实现按序号读取；只是 `lib/application/services/event-service.ts:4-25` 目前仅持久化任务、运行、操作、能力、压缩、重试和产物级事件，不含流式正文。地基存在，但补发范围必须分层设计。计入路线图 P2，不作为问题扣分。

---

## 改造路线图

### P0（已完成；原估 2–3 人日，低风险）

| 步骤 | 状态 | 改什么 | 收益 | 风险 | 预估代价 |
|---|---|---|---|---|---|
| P0-1 | 已完成 | 抽 `lib/api-client.ts`：先统一普通 JSON 请求的解析/错误语义与共享响应类型，优先迁移 SessionSidebar、SkillsConfig、ModelsConfig；流式登录、上传等特殊请求保留专用实现 | 收拢问题 2 的主要重复；API 改动更集中 | 低：分批迁移，每批跑 tsc/lint | 1–1.5 人日 |
| P0-2 | 已完成 | 给 `architecture-boundary.test.mjs` 补 application/services 守卫：白名单只允许 reconciler import adapters，禁 Pi SDK | 锁死问题 4 的例外扩散 | 低：只加静态守卫；需把唯一例外写明 | 0.5 人日 |
| P0-3 | 已完成 | 抽出并测试 `buildSessionTree`、`slashMatchRank`、模型兼容配置转换 | 核心纯逻辑先获得回归保障 | 低：照现有 `lib/patch.test.mjs` 样板 | 0.5–1 人日 |

### P1（已完成；原估 10–15 人日，中风险）

| 步骤 | 状态 | 改什么 | 收益 | 风险 | 预估代价 |
|---|---|---|---|---|---|
| P1-1 | 已完成 | 拆 `useAgentSession`（1651 行/71 个返回成员）为 4 个 hook：会话数据流、模型与工具配置、扩展 UI、通知队列；先切出不依赖 SSE 的三块 | 问题 1 最大头；每块可独立测 | 中：回调引用稳定性和旧事件迟到规则必须保持 | 4–6 人日 |
| P1-2 | 已完成 | 引入 `zustand@5.0.12`，只承载选中会话、新会话目录、当前目录和项目根；worktree 快照、unread、表单和弹窗仍留本地 | 切断导航/工作区的 props 穿透链，同时避免全局状态膨胀 | 中：原子动作、单字段 selector 与边界测试已覆盖 | 3–4 人日 |
| P1-3 | 已完成 | 已物理拆出边界清楚的子面板：ModelsConfig 的授权/密钥/连接测试，ChatInput 的命令面板/附件/模型选择，SessionSidebar 的 worktree 区域 | 大文件改动的波及面变小，为后续状态迁移找落点 | 中：自动化与浏览器焦点/弹层冒烟均通过 | 3–5 人日 |

### P2（已完成；原估 20–30 人日，高收益高风险）

| 步骤 | 状态 | 改什么 | 收益 | 风险 | 预估代价 |
|---|---|---|---|---|---|
| P2-1 | 已完成 | 拆 `rpc-manager.ts`：registry/生命周期一块、extension UI context 一块、25-case command dispatch 按命令域拆 handler 表 | 问题 3；新 RuntimeCommand 不再改 1259 行文件 | 中高：11 个 route + 1 个服务端桥接模块依赖该入口，需保持 `globalThis.__piSessions` 热重载语义 | 5–8 人日 |
| P2-2 | 已完成（保留轮询） | SSE 给运行完成等持久事件加单调序号和 `?since=` 补发；断线期间正文从当前会话快照恢复，不做逐片段回放 | 先消除最危险的“运行已结束但界面仍在转”，同时保留轮询兜底 | 高：运行状态连接恢复已实测；活跃生成 durable 补发仍建议灰度 | 8–12 人日 |
| P2-3 | 已完成 | AppShell/SessionSidebar/ChatWindow 共享导航与工作区 store，删除 5 个中转参数和多源同步 effect | 把问题 1 从“文件变小”推进到“数据流真正变简单” | 高：原子状态测试、架构边界测试、全量回归和浏览器冒烟均通过 | 7–10 人日 |

**下一步建议**：路线图已执行完。若未来要减少 15 秒轮询，先补一次“活跃生成中断线 + durable 事件补发 + 后台标签页恢复”的灰度；当前仅验证运行状态通道会重连，不足以删除兜底。

---

## 附：证伪记录（按规矩保留）

1. 「runtime-registry.ts import adapters」——证伪：`adapters` 是私有 Map 字段名（`lib/application/services/runtime-registry.ts:6`），无对应 import。
2. 「doctor route→persistence 违规」——证伪：doctor 是服务端 route，AGENTS.md 仅禁 client 代码引用 persistence。
3. 「MessageView 内嵌 diff 解析重复造轮子」——证伪：`components/MessageView.tsx:8` 直接复用有测试的 `lib/patch.ts`。
4. 基线「全仓库唯一测试目录是 lib/adapters/pi/__tests__」表述不精确：实测 44 个 *.test.mjs，39 个散在 lib/、components/ 根下，5 个在 __tests__；__tests__ 是唯一测试「目录」。事实指向（测试分散）成立，不影响其他结论。
5. 「lib/subagent 是仓库死代码」——证伪：实测目录为空、源码 0 引用；空目录不会进入 Git，因此只是本地工作区残留，不构成仓库架构问题。用户批准后已删除。
