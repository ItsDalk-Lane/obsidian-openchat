# 调研发现

## 2026-07-28 基线

- `package.json` 有真实的 `typecheck`、`lint`、`test` 和聚合 `check` 脚本；项目规则禁止在开发期运行 `next build`，本轮不跑构建。
- 排除依赖、构建产物与本轮规划文件后，共 286 个受盘点文件：`lib` 156、`app` 63、`components` 24、根目录 18、`docs` 7、`electron` 7、`hooks` 6、`bin` 3、`build` 2。
- 运行时核心依赖四个 Pi 包都锁在 `0.82.1`；应用同时覆盖网页服务、桌面壳、本地持久化、插件/技能/MCP/认证等多个职责。
- `app/components/hooks/lib/electron` 的 TypeScript/JavaScript/MJS 合计 38,629 行；11 个文件超过 1,000 行，最大三个是 `ChatInput.tsx` 2,169 行、`SessionSidebar.tsx` 1,963 行、`useAgentSession.ts` 1,651 行。界面状态和流程过度集中是需要重点验证的候选问题。
- 后端协调入口 `lib/rpc-manager.ts` 1,259 行；单个文件同时承接会话注册、启动、命令、事件与生命周期，需核查职责是否已超过合理边界。
- 已有架构边界测试覆盖内核、应用端口、持久化、制品渲染及两个迁移点，但主要靠源码正则做有限禁用；尚未证明应用服务、接口层、客户端代码的整体依赖方向和循环引用受到约束。
- 持久化服务已有集中组装入口，任务解析接口会先同步原生会话，再读取持久化任务；这是可保留的正确方向。
- 旧会话接口、运行中代理接口和新任务接口仍同时被界面调用；聊天钩子还保留从原生会话编号现场拼出任务/运行编号的兜底路径。当前系统存在“两套身份、两套事实来源并行”的迁移期复杂度，需重点判断何时以及如何收口。
- `AgentSessionWrapper` 内同时包含扩展界面、运行状态、事件翻译、MCP 状态、操作生命周期和空闲销毁等职责，后端协调层拆分价值较高，但必须用行为测试保护。
- 当前共有 58 个接口入口，其中任务域 16 个、旧会话域 7 个、代理域 5 个；三套入口共同服务一次聊天流程，跨入口的一致性、错误格式和权限边界值得统一。
- 服务端运行时适配器仍直接回接旧的会话注册器；这让“通用运行时抽象”在 Pi 之外尚未被第二个实现证明，建议先评估抽象是否真的降低耦合，再决定继续扩展还是收窄。
- 界面事件流在解码失败或缺少新身份信息时，会用原生会话编号现场拼出任务与运行编号；这会掩盖持久化解析失败，并可能让同一轮对话在不同页面拿到不同身份。

## 2026-07-28 P0 实施

- 当前按评估路线图只执行 P0；P1/P2 不在本轮修改范围。
- 通用请求工具仅覆盖普通 JSON 请求；流式授权、上传和 SSE 保持专用实现。
- 验收以新增行为测试、架构边界测试、全量测试、类型检查和 lint 为准，禁止运行 `next build`。
- `lib/agent-client.ts` 已采用“非成功响应或响应体 error 字段即抛错”的调用方式；通用 JSON 请求工具沿用该约定。
- 目标组件混有普通 JSON 与授权流式请求，不能机械替换全部 fetch；OAuth 登录流保持专用实现。
- 改造前 `npm test`：173 项通过、0 失败；存在既有 MODULE_TYPELESS_PACKAGE_JSON 告警，本轮不改 package 配置。
- `lib/api-types.ts` 已是跨前后端接口类型集中点；新增响应契约应放在这里，不另造平行文件。
- 三个优先组件共有 25 处 fetch，均为普通 JSON 请求；OAuth 的持续推送使用 EventSource，不在这 25 处内，因此可迁移全部 fetch 而保留流式通道。
- 工作树删除失败会返回 `{ error, dirty }`，界面据此决定是否二次确认；统一错误类型必须保留 HTTP 状态和解析后的响应体。
- P0-1 完成后，三个优先组件 fetch 从 25 降为 0，`components/` + `hooks/` 总数从 59 降为 34；OAuth EventSource 保留。
- `requestJson` 当前由三个优先组件和 `lib/agent-client.ts` 共用；6 项行为测试覆盖序列化、自定义请求头、结构化错误、200 响应 error 字段、空响应和无效 JSON。
- application/services 边界测试已增加：只有 `pi-session-reconciler.ts` 可引用 `pi-task-projector`，其余 adapter import 和全部 Pi SDK 直连会失败；现有 8 项边界测试通过。
- 三块纯逻辑已分别落到 `session-list-tree.ts`、`slash-command-ranking.ts`、`model-config.ts`，新增 8 项行为测试。
- 抽取时确认原会话树的循环保护无法处理两个现存会话互相指向；现已让循环节点安全成为根节点，测试锁定“不丢会话”。
- 最终 `npm test` 为 188 项通过、0 失败；`npm run typecheck` 与 `npm run lint` 均退出码 0，`git diff --check` 无输出。
- 已逐个核对本轮迁移接口的返回约定：失败分支均返回非成功状态或 `{ error }`，不存在“成功状态码 + `success:false` 且无错误文本”的第三种失败语义。
- `ARCHITECTURE_REVIEW.md` 已保留 P0 前评估快照，并新增 P0 后现状；`AGENTS.md` 已记录普通 JSON 请求的统一入口及特殊传输例外。
- 本轮未做浏览器内人工点选冒烟测试；远端发布、部署和线上状态不在本轮范围。
- Codex/Claude 记忆与项目外规则仅盘点未改写；没有获得写入记忆的授权，也没有发现需要同步的项目事实。
- `task_plan.md`、`findings.md` 属于本轮一次性工作记录；按收口规则保留，若要删除需用户另行批准。

## 2026-07-28 P1 实施

- P1-1 优先于状态库选型执行；通知队列、扩展界面、模型与工具配置是候选低耦合边界，消息/SSE/对账主链暂不改。
- P1-2 需要新增依赖或明确采用零依赖方案，按既有 `BLOCKED.md` 决策跳过。
- `useAgentSession` 当前直接维护 37 组状态；通知队列占 1 组 reducer + 1 个定时 effect，扩展界面占 4 组状态 + 3 个动作，模型/工具配置占 11 组状态 + 4 个动作。
- 通知队列完全不依赖会话消息；扩展界面只需要当前会话编号、输入框窄接口和通知入口，适合先拆。
- 模型/工具配置会被新会话创建、会话加载、事件处理和资源重载共同写入；可以抽钩子，但必须显式返回少量同步 setter，不能把新会话创建或 SSE 逻辑一起搬走。
- `UseAgentSessionOptions.setToolPreset` 当前没有外部调用方，但先保留兼容入口；P1-1 不借机删公开字段。
- 扩展界面状态有三条同步来源（初次加载、运行中对账、运行结束快照）和一条事件增量来源；新钩子应提供单一 `syncSnapshot` 入口，避免主钩子继续逐字段写状态。
- 通知队列与扩展界面拆分后，主钩子从 1,651 行降至 1,485 行；扩展状态的三条服务端同步路径已统一走 `syncExtensionUiSnapshot`。
- 新增 6 项纯状态测试全部通过；第一次测试失败是预期写错，已按原 reducer 行为校正，业务实现未因此改变。
- 模型与工具配置拆分后，主钩子降至 1,425 行、直接 `useState` 从 37 组降至 22 组；模型列表、默认选择、工具预设和推理档位集中在 `useAgentConfiguration`。
- TypeScript AST 实测主钩子返回成员仍为 71；唯一调用方 `ChatWindow` 无需改动，P1-1 先保持对外兼容，再由后续数据边界改造收窄接口。
- 三个新 hook 的 9 项纯状态/选择逻辑测试通过，P1-1 小范围 typecheck 通过。
- P1-1 全量验收为 197 项测试通过、0 失败，typecheck/lint/diff check 通过；既有 `MODULE_TYPELESS_PACKAGE_JSON` 告警仍存在。
- 运行态探测 `curl http://127.0.0.1:30141` 连接失败；开发服务未运行，按规则不启动或重启，浏览器冒烟保持未验证。
- `.zcode/plans/plan-sess_4fa99e1c-5a80-4a45-bfff-51cd5cf5fd02.md` 是 2026-07-27 留下的未跟踪子代理方案，早于本轮且与 P1-1 无关；仅列为清理候选，不删除。
- P1-3 基线：ModelsConfig 1,589 行/21 个 useState，ChatInput 2,160 行/18 个 useState，SessionSidebar 1,905 行/38 个 useState。
- ModelsConfig 已有明确的顶层子组件边界：模型详情、OAuth 详情、API Key 详情、供应商选择器；优先把连接测试和两类授权详情物理迁出，不改变父级选择状态。
- ModelsConfig 的表单控件、连接测试、OAuth 与 API Key 面板已迁到 `components/models-config/`；主文件从 1,589 行降至 968 行，`useState` 文本计数由 21 降至 12。授权持续推送通道仍由授权面板持有，父级继续只负责加载、选择和保存配置。
- P1-3b 分步执行两次 typecheck，收尾 typecheck/lint 均退出码 0；没有改接口、安装依赖或启动开发服务。
- ChatInput 的附件预览、斜杠命令菜单和模型选择器已迁到 `components/chat-input/`；主文件从 2,160 行降至 1,856 行，`useState` 文本计数从 18 降至 16。模型选择器自行管理弹层位置、外部点击关闭和两组局部状态，主输入仍管理发送、快捷键、草稿和文件补全。
- P1-3c 的 typecheck/lint/diff check 均通过；命令选择继续通过父级回调写入文本，附件移除继续使用父级对象地址释放逻辑，未改快捷键判定。
- SessionSidebar 的工作树创建、删除、脏目录确认、下拉与输入状态已迁到 `components/session-sidebar/WorktreeSwitcher.tsx`，路径标签与下拉动画迁到同目录公共界面原语；主文件仍持有工作树加载快照，供项目归组逻辑使用。
- SessionSidebar 主文件从 1,905 行降至 1,457 行，`useState` 文本计数从 38 降至 30；P1-3d 的 typecheck/lint/diff check 均通过。
- P1-3 最终验收：`npm test` 197/197、typecheck、lint、diff check 全部通过；既有 `MODULE_TYPELESS_PACKAGE_JSON` 告警不变。开发服务未运行，浏览器焦点、快捷键和弹层点选仍未验证。

## 2026-07-28 P2 实施

- P2 从当前未提交的 P0/P1 工作区继续，不能覆盖或回滚既有改动；起始自动化基线为 197 项测试通过。
- P2-1 先拆 `rpc-manager.ts`，但所有 route 和服务端桥接仍通过原公开入口调用，避免一次改动扩散到 12 个消费者。
- P2-2 按现行持久化规则只补发 durable journal 事件，消息正文靠会话状态快照；流式正文完整回放仍保留在 `BLOCKED.md`，不擅自扩大范围。
- P2-3 依赖 P1-2 的共享状态归属决定，当前阻塞；按无人可问规则跳过，先做 P2-1/P2-2。
- `rpc-manager.ts` 当前仍为 1,259 行，`AgentSessionWrapper.send()` 有 25 个 command case；注册表/启动锁位于文件末尾，扩展界面实现集中在类后半段，具备明确的物理搬迁边界。
- 持久事件服务实际文件是 `lib/application/services/event-service.ts`，journal 端口已有 `readAfter(sequence)`，SQLite 实现已有全局单调 sequence；此前计划中写的 `event-journal-service.ts` 不存在，已按实际路径继续。
- `/api/tasks/[id]/events` 已提供按任务读取持久事件的分页接口；聊天 SSE `/api/agent/[id]/events` 目前只发 connected、实时事件和心跳，没有读取 journal 或解析 `since`。
- `rpc-manager` 的直接消费者仍通过其现有公开导出访问；P2-1 可把内部模块迁走而保留 `lib/rpc-manager.ts` 作为兼容门面。
- P2 起始针对性基线：`rpc-manager` 与 event journal 共 6 项测试通过，typecheck 退出码 0；全量基线沿用 P1 收口的 197/197。
- P2-1 的低耦合边界有三块：无业务依赖的操作生命周期计数器、只依赖结构化会话接口的 `globalThis` 注册表、通过事件回调与主 wrapper 相连的扩展界面桥。先拆这三块，再处理命令分派。
- 操作生命周期与全局注册表已迁到 `lib/rpc/`；`rpc-manager.ts` 从 1,259 行降至 1,176 行。全局键名、启动锁合并、退出清理和运行状态去重广播语义保留。
- 新增 3 项真实行为测试，覆盖终态只落一次、终止当前操作、全局注册表和运行快照去重广播；连同既有协调器测试共 5/5 通过，typecheck/diff check 通过。
- 扩展界面代码通过一个窄连接面与主 wrapper 交互：读取当前任务/运行/操作编号、发出 KernelEvent、在扩展 reload 后重应用空系统提示词。其余待响应请求、自定义界面、状态条和小组件均可由独立 bridge 自管。
- 既有 `rpc-manager.test.mjs` 的自定义界面断言直接切 `rpc-manager.ts` 源码片段；迁移 bridge 时必须把测试目标同步到新模块，并增加状态/事件行为断言，不能只让旧静态测试失效。
- 界面桥接拆分的断点状态：`lib/rpc/extension-ui-bridge.ts` 已承接请求等待、状态/小部件、自定义界面和命令上下文动作；`lib/rpc-manager.ts` 仍残留同一套旧方法与字段引用，必须先完成委托替换再运行类型检查。
- 待替换点可由 `rg -n "pendingUi|extensionStatuses|extensionWidgets|createExtensionUiContext|resolveExtensionUiResponse|handleExtensionUiInput|createExtensionCommand" lib/rpc-manager.ts` 复现；本轮开始时命中主文件第 247、310、402-403、601-605、628、633、721-1048 行。
- 接线完成后上述旧字段和旧方法在 `rpc-manager.ts` 已无命中，`npm run typecheck` 退出码 0；主协调器保留的界面职责仅为创建桥、读取快照和转交输入/响应。
- 扩展桥测试需要同时覆盖两类证据：静态断言确认自定义界面仍拿到固定宽度的无头终端门面；行为断言确认装饰状态归桥所有、发出的仍是内核事件、一次性响应结算后不会重放旧请求。
- 扩展桥迁移验收：针对性测试 7/7、typecheck 通过；`rpc-manager.ts` 从 1,176 行降到 786 行，独立桥为 434 行。总行数几乎未变，但主协调器的字段和职责边界已经收窄，属于可测试的职责搬迁而非删代码凑数字。
- 25 类命令可按风险分成两组：提示词、终止、分叉、树导航、压缩和终端命令直接参与运行生命周期或会话文件变更，继续由协调器持有；状态读取、模型/推理/工具设置、会话元数据、队列、扩展界面和资源重载可通过窄上下文迁到普通命令处理器。
- 普通命令处理器采用“命令名到处理函数”的显式表，并用未处理哨兵把复杂命令退回协调器；这样不会把合法的 `null` 返回值误当成未处理，也保持未知命令最终仍由原分支报错。
- 17 类普通命令迁出后，协调器只剩提示词/终止、分叉/树导航、压缩/终止压缩、终端/终止终端 8 个分支；主文件 786→659 行。分派、界面桥、注册表和生命周期新增测试合计 10/10。
- P2-1 全量验收为 205 项测试通过、0 失败，typecheck、lint、diff check 通过；既有 `MODULE_TYPELESS_PACKAGE_JSON` 告警不变。
- P2-2 现状：持久层的 `sequence` 是全局单调值，任务事件接口按任务过滤后分页；聊天 SSE 只发送内核事件本体，实时持久化调用丢弃了返回的序号，因此客户端目前无法知道“最后确认收到的持久序号”。
- 服务端补发必须同时按当前任务和运行过滤，不能直接把全局 `readAfter` 结果全部发给单会话；已有 `getByTask(..., { afterSequence, runId })` 正好满足该边界。
- 客户端现有的本地运行编号只保护异步轮询/加载结果，事件处理入口没有服务端操作编号映射；本轮不删除 15 秒轮询，也不把序号补发夸大成正文级精确恢复。序号只负责避免已确认持久事件重放，状态快照继续负责最终纠偏。
- 浏览器原生事件流支持 `id` 与自动重连的 `Last-Event-ID`；服务端可保持 `data` 为原 KernelEvent，不改现有解码器，只在持久事件上附序号，并在手工重建连接时用 `since` 查询参数带回客户端保存的游标。
- P2-2 实现后，服务端先订阅实时事件再同步补发缺口，并对初始化期间的重复持久事件按序号去重；首次连接以全局最新序号为水位，因此不会无条件回放整段历史。
- P2 最终全量验收为 211 项测试通过、0 失败，typecheck、lint、diff check 通过；端口 30141 未运行（`HTTP 000`），所以真实浏览器断线/后台标签页恢复仍未验证，15 秒轮询明确保留。
- 最终差异审计补上两个恢复边界：客户端游标若高于重建后的 journal 最新值则从当前水位重新开始；同一持久事件幂等重送时，服务端不会发送不大于已交付水位的序号。

## 2026-07-28 P1-2 / P2-3 解阻

- 用户已明确选择状态库并授权浏览器运行验证；报告唯一候选为 Zustand，因此按该候选执行，不再保留零依赖分支。
- Zustand v5 官方文档建议用 `create<T>()(...)` 建立类型化 hook store、组件按单字段 selector 订阅，嵌套对象显式不可变更新；本轮避免把表单和弹窗局部状态塞入 store。
- 用户明确不做流式正文逐片段回放，doctor route 与 application 的 Node crypto 保持现状；这些不再是待裁决问题。
- 当前真正跨顶层消费者的是 `selectedSession`、新会话 cwd 和有效工作目录/项目根：AppShell 生产并消费，SessionSidebar 与 ChatWorkspaceView/ChatWindow 继续接收 props。侧栏的完整 worktree 快照和 unread 集合只有侧栏子树消费，应继续留在侧栏，避免为了“用了 store”而扩大共享面。
- 迁移目标可删除 SessionSidebar 的 `selectedSessionId`、`selectedCwd`、`onCwdChange` 三个 props，以及 ChatWorkspaceView/ChatWindow 的 `session`、`newSessionCwd` 两级中转；会话选择回调仍保留，因为它还负责 URL、移动端抽屉和聊天视图重置等编排副作用。
- `npm install --save-exact zustand@5.0.12` 成功；npm 同时报告来自既有 `@emoji-mart/react`/React 19 组合的 peer 覆盖警告和当前依赖树 32 项 audit 告警，本轮不运行自动修复，避免把状态迁移扩大成依赖升级。
- store 接线保留 AppShell 的 URL、移动端和视图重置编排，但工作区变更改由 store selector + effect 观察；侧栏选择目录时同时写 cwd 与项目根，避免 worktree 切换被误判为跨项目。
- 共享状态接线完成后，SessionSidebar 不再接收选中会话编号、选中目录和目录变更回调，ChatWorkspaceView/ChatWindow 不再中转会话对象与新会话目录；会话选择回调仍保留顶层编排副作用。
- 工作树列表和未读集合只有侧栏子树消费，继续留在侧栏；新增架构测试禁止它们与弹窗、消息正文状态进入共享 store，并禁止已删除的中转 props 回流。
- 后台把同一目录补全为真实项目根时可能造成一次多余的新会话重置；AppShell 已增加“目录未变且仍是同一新会话”的短路条件。
- 全量自动化最终为 215 项测试通过、0 失败；typecheck、lint、`git diff --check` 均通过，既有 `MODULE_TYPELESS_PACKAGE_JSON` 告警仍未改配置。
- 默认本机 kernel 数据库 schema 为 4，而当前工作区只支持 3，开发服务会在 instrumentation 阶段退出；浏览器验证使用独立临时 `PI_WEB_DATA_DIR`，未读取、降级或覆盖用户数据库。
- 浏览器最终实测：首页 HTTP 200，输入框焦点正常，项目下拉可打开，模型/技能/插件/MCP 四个弹层均可打开关闭；当前测试目录非 Git 根，工作树入口按设计只读显示。
- 真实关闭开发服务再恢复后，`/api/agent/running/events` 请求数从 1 增为 2；恢复后控制台错误、页面脚本错误、非预期请求失败均为 0。断线窗口内 5 条控制台网络错误和 2 个失败请求属预期，3 个 `ERR_ABORTED` 是快速关闭弹层主动取消。
- 浏览器测试等待 `networkidle` 超时是长期 SSE 连接导致；改以 DOM 完成、稳定可见控件和请求/错误监听判定页面就绪，不把持续连接误判为加载失败。
