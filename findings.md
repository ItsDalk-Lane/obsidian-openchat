# 审计发现记录

## 规则与上下文

- 项目采用分域分层架构，聊天域存在 `src/domains/chat/**` 真源与
  `src/core/chat/**`、`src/commands/chat/**` legacy 兼容层并存的情况。
- 本轮用户任务聚焦聊天界面相关功能，且要求交付清理方案与验证结果。
- 当前工作树已有聊天域未提交改动，后续任何清理都必须避开这些未决更改。

## 初步观察

- 仓库未见独立服务端目录；需要把“后端”解释为插件内部非 UI 的 service、
  provider、持久化与命令层能力。
- `docs/architecture.md` 明确指出部分 chat legacy 文件“仅保留兼容 shim”，
  这些文件是本轮重点核查对象。

## 关键发现

- 2026-03-31 提交 `7ca664cd04b2d946537b826fb67bbbf0c240dab0` 删除了
  `SlashCommandMenu.tsx`、`TemplateSelector.tsx`、`TemplateSelector.css`，
  同时移除了系统提示词管理相关组件与类型。
- 2026-03-29 提交 `6c24841c258ae86499e6919a52395dfa0a006bd7` 删除了
  `CompareGroupManagerDialog.tsx`、`CompareModelSelector.tsx`、
  `MultiModelSelector.tsx` 与 `multi-model-config-service.ts`，但多模型对比主链
  仍由 `ModeSelector`、`ModelSelector`、`ParallelResponseViewer`、
  `MultiModelChatService` 继续承担，因此不能作为冗余整体删除。
- 当前版本里 `ChatSession.systemPrompt`、`ChatSession.enableTemplateAsSystemPrompt`、
  `ChatState.enableTemplateAsSystemPrompt` 已不再被运行时代码读写，只剩类型/测试残留。
- `src/core/chat/services/chat-service-history-api.ts` 中
  `getPromptTemplateContent()` 与 `hasPromptTemplateVariables()` 无调用方，属于孤立 API。
- `src/components/chat-components/hooks/useSlashCommand.ts` 已无任何引用，
  与现行的 `useChatInputSlashCommand.ts` 实现重复。
- `src/components/chat-components/McpModeSelector.tsx` 已完全无引用，但
  `mcpToolMode` / `mcpSelectedServerIds` 仍驱动 `ChatToolRuntimeResolver`
  的三模式分支，构成前后端失配的半废弃功能栈。
- `ChatSettings.enableSystemPrompt` 仅残留在 chat 域类型与默认配置中，
  当前聊天 UI、state API 与 provider message 主链均不再消费。

## 2026-04-02 内置工具架构升级设计

- 当前项目真正的优势在 tool surface 与路由系统，而不是 `BuiltinTool` 本体。
- 当前 `BuiltinTool` 过薄，无法表达工具级验证、权限/确认、动态风险、并发语义、
  中断行为、进度与结果表达。
- Claude Code 在“单工具契约完整度”上更强，但其 UI 渲染内聚方式不适合直接迁入
  当前项目。
- 本轮设计采用折中方案：保留当前项目两阶段 surface 设计，同时把验证、权限、
  动态风险、进度、结果序列化等能力收回单工具契约。
- 两份外部分析文档中的错误项已排除：
  - `grep_content` 不应列为新增，因为当前 `search_content` 已支持 regex 与上下文行。
  - 当前项目的强项不应被误判为 `BuiltinTool` 本身，而是外层 `ToolDefinition`、
    discovery、runtimePolicy 与参数修复体系。
- 为便于后续使用 Codex 连续实现，已补出一份“单个对话完成一个 Step”的路线图文档。
- 路线图先完成旧 `BuiltinTool` 体系迁移，再进入新增工具阶段，避免边迁边扩导致漂移。
- `sub-agents` 现阶段属于独立 `ToolDefinition` 体系，应在路线图中单列收尾检查，
  但不直接并入本轮 `BuiltinTool` 迁移主线。

## 2026-04-02 路线图 Step 01 发现

- `BuiltinTool` 当前在 runtime 中属于“额外字段天然被忽略”的对象形态，因此可以先扩展
  契约类型和 fail-closed 默认值，而不触发任何既有执行行为变化。
- `buildBuiltinTool()` 不能直接复用 `unknown` 版本的默认对象作为泛型返回值；否则
  `checkPermissions.updatedArgs` 会与具体 `TArgs` 发生类型不兼容，需要按泛型现场生成默认值。
- `tool-result.ts` 可先提供 `normalizeBuiltinToolExecutionResult()` 作为兼容辅助层，
  为后续 Step 02 接入 `serializeResult()` 预铺路，但当前执行链仍保持旧逻辑。
- 全量 `npx tsc --noEmit` 目前被仓库既有问题阻塞，错误分布在 `infra/`、
  chat/settings/providers 等多个域；因此 Step 01 的有效验收口径应为：
  - runtime 相关回归测试通过
  - 改动文件未新增 `tsc` 报错

## 2026-04-02 路线图 Step 02 发现

- `BuiltinToolExecutor` 若继续只拿 `name + args` 黑箱调用 runtime，就无法消费
  `validateInput()`、`checkPermissions()`、`serializeResult()` 等新钩子；必须先拿到
  registry 中的真实 `BuiltinTool` 对象。
- 顶层 builtin 执行不能直接绕过 `ChatPlanSyncService.createBuiltinCallTool()`，
  否则会丢失 `write_plan` 的续写 guard；最稳的兼容做法是把注入点升级为
  `(tool, args, context) => result` 形式，而不是退回到 `registry.call()`。
- 业务校验、权限拒绝、输出校验需要扩展 `ToolErrorContext.kind`，否则只能伪装成
  `argument-validation`，会混淆失败阶段与修复建议。
- 现有参数修复链会对部分内置工具做别名映射，例如 `delete_path` 会把 `path`
  归一化到 `target_path`；Step 02 的单测若要验证权限流，应避开已有 hint 干扰，
  使用自定义危险工具名更稳定。
- 执行器层接入 `reportProgress()` 的最小有效方式，是把 `toolUseSummary` /
  `activityDescription` 与 phase 一起包装进 `ToolExecutionOptions.reportProgress`；
  上层暂时不接 UI 也不影响兼容性。
- 由于项目要求单文件不超过 500 行，`BuiltinToolExecutor` 的纯辅助逻辑需要拆到
  邻近 helper 文件；否则 Step 02 很容易在功能完成后反向踩到工程规范。

## 2026-04-02 路线图 Step 03 发现

- `registerBuiltinTool()` 若继续只接受旧的 `(name, options, handler)` 形态，就无法为
  后续迁移中的工具提供“同一对象内声明元数据并直接注册”的入口；最稳妥的兼容做法是
  保留旧签名，同时增加直接接收 `BuiltinToolInput` 的重载。
- `BuiltinToolRegistry` 若不在 `register()` 时统一走 `buildBuiltinTool()`，那么
  `registerAll(createXxxTools())` 这类直接返回 `BuiltinTool[]` 的工厂路径就拿不到
  fail-closed 默认值，也无法保证旧 shape / 新 shape 在 registry 内部行为一致。
- 仅让 registry 持有新字段还不够，`BuiltinToolInfo -> ToolDefinition` 的桥接若不把
  邻近 `surface` / `runtimePolicy` 合并进来，chat surface 仍然只会读外层蓝图，
  新元数据会在 runtime `listTools()` 之后丢失。
- 邻近 `surface` 需要兼容未来更贴近路线图表述的 `surface.family`，而不是只接受
  `familyId`；因此桥接层应同时识别 `family` 和 `familyId`，避免后续工具迁移时再做
  一次破坏性字段改名。
- Step 03 的有效验收口径应聚焦三条链路：
  - `registerBuiltinTool` 的旧 shape 行为保持不变
  - 新 shape 可以注册并透传邻近元数据
  - `createBuiltinToolDefinition()` 能消费这些元数据并影响最终 executable schema

## 2026-04-02 路线图 Step 04 发现

- Step 04 的核心不是“马上迁移工具实现”，而是先把后续迁移会稳定依赖的落点固定下来；
  否则 Step 05 以后每迁一个工具都要边搬代码边重新决定目录约定，容易造成结构漂移。
- `tool.ts / schema.ts / description.ts / service.ts` 的角色若只写在设计文档里，后续实现时
  仍然可能因上下文丢失而走样；最稳妥的做法是在 `runtime` 下补一个轻量常量模块，把
  这四类文件的职责直接固化到源码里。
- Vault 域的 `_shared` 比“直接新建很多工具目录”更优先，因为现有路径、结果格式化和查询
  解析 helper 本来就高度复用；先给它们一个稳定出口，后续迁移单工具目录时才能避免重复
  从 legacy 大文件横向引用。
- 在不提前迁移旧工具的前提下，骨架文件最安全的形式是“邻近 re-export + legacy source
  标记”，而不是切换现有注册入口；这样既能为下一步准备路径，又不会引入行为变化。
- Step 04 的最小有效验收口径应是：
  - 新目录真实存在且命名可复用
  - 新增骨架文件可以通过最小测试与定向类型筛查
  - 现有 runtime 未开始依赖这些骨架，因此不会改变工具执行行为

## 2026-04-02 路线图 Step 05 发现

- Step 05 最稳妥的迁移方式不是直接删掉 legacy 注册文件，而是把
  `filesystemReadWriteHandlers.ts` / `nav-tools.ts` 收敛成薄桥接层，
  让旧入口继续存在，但真实工具工厂落在单工具目录内。
- Step 04 建好的 `vault/_shared` 在这一步已经发挥作用：`read_file`、
  `read_media`、`open_file` 的新 `service.ts` 可以只依赖共享出口，而不必继续横向
  引用 legacy 大文件里的散落 helper。
- `open_file` 的“何时不要用”与“稳定目标”语义无需等到 Step 14 才集中收口；
  现在就可通过邻近 `surface` 增量覆盖中央 blueprint，把精确信息放回工具本体。
- `registerBuiltinTool()` 的新 shape 入口对参数类型仍隐含
  `Record<string, unknown>` 约束；`OpenFileArgs` 若只声明普通接口，
  在直接注册工具对象时会触发类型不兼容，需要显式继承该约束。
- 当前 Node 测试环境无法直接执行依赖 Obsidian runtime 值对象的真实文件打开链路；
  因此 Step 05 的最小有效验收口径应调整为：
  - 新目录不再只是 Step 04 骨架，而是真实工具工厂/描述/schema/service
  - legacy 注册入口明确复用新工厂
  - 定向 `tsc` 不报告本步改动文件的新类型错误

## 2026-04-02 路线图 Step 06 发现

- `find_paths` 与目录 wrapper 的迁移也应沿用 Step 05 的“旧入口薄桥接，新目录成事实来源”策略；
  否则 `filesystemSearchHandlers.ts` / `filesystemWrapperTools.ts` 很快会重新膨胀回
  大文件注册中心。
- `filesystemWrapperSupport.ts` 已被 chat 测试与 surface 组装逻辑直接依赖，
  因此 Step 06 不能简单删除它；最稳妥的做法是保留该文件作为兼容 re-export 层，
  把 schema 与参数构造器桥接到新目录。
- 目录 wrapper 的 schema 故意不暴露 `response_format`，而内部 builder 仍需补齐
  `ListDirectoryArgs` 的默认字段；否则在迁移后会因为 `zod` 默认值推导出的完整参数
  类型而触发类型缺项。
- Node 测试环境无法直接 import 依赖 `obsidian` 运行时值的 discover tool 工厂；
  因此 Step 06 的最小有效测试策略应以“纯 schema 解析 + 源码桥接检查”为主，
  而不是直接在测试里实例化这些工具。
- Step 06 的有效验收口径应聚焦三点：
  - 四个 discover 工具都在单工具目录中声明统一的 `surface.family`
  - wrapper 兼容层 `list_directory` 与 `filesystemWrapperSupport` 仍然可用
  - 定向 `tsc` 不报告 discover 迁移文件的新类型错误

## 2026-04-02 路线图 Step 08 发现

- `write_file` / `edit_file` 也应沿用 Step 05、Step 06 的“旧入口薄桥接，新目录成事实来源”策略；
  直接继续把实现堆在 `filesystemReadWriteHandlers.ts` 里，会让写入、删除、目录创建重新混回大文件。
- Step 08 虽要求补 `checkPermissions()`，但当前真实执行通道尚未普遍提供确认 UI；
  因此最稳妥的兼容做法不是“所有写入都一律 ask”，而是只在更高风险场景进入确认流：
  - `write_file` 覆盖已有文件时 ask
  - `edit_file` 的多处编辑或明显删改型编辑时 ask
  - `edit_file.dry_run=true` 保持 read-only / concurrency-safe
- `edit_file` 的“最小锚点策略”主要体现在描述与输入校验层，而不是重写
  `applyEditsToText()` 逻辑；保持旧的 whitespace-tolerant 替换行为，才能不破坏现有编辑工作流。
- `src/core/services/fileOperationHelpers.ts` 适合作为本步的共享写入风险 helper 落点：
  - 路径校验补上 `..` 拦截，可与 Vault 路径断言形成一致安全边界
  - 文本替换的“是否明显破坏性”可抽成通用判断，供整文件覆盖与局部编辑共用
- Step 08 的最小有效验收口径应聚焦三点：
  - `write_file` / `edit_file` 已迁入单工具目录，并由 legacy 注册入口复用
  - 两个工具都声明 `validateInput()`、`checkPermissions()` 与动态风险钩子
  - 定向测试通过，且 `tsc` 二次筛查未报告本步文件新增类型错误

## 2026-04-02 路线图 Step 09 发现

- `move_path` / `delete_path` 同样适合沿用“旧入口薄桥接，新目录成事实来源”的迁移模式；
  否则高风险写入、搜索与 stat 工具会继续混堆在 `filesystemSearchHandlers.ts` 中。
- Step 09 的关键不是把所有失败都提前改成 validation / permission deny，而是把真正的危险动作放进确认流：
  - `move_path` 对真实存在的源路径默认 ask
  - `delete_path` 对真实存在的目标路径默认 ask，并上调到 destructive 风险
  - 不存在目标仍保留旧的 no-op 兼容结果，避免把“空操作”误变成强制确认
- `move_path` 需要额外补一条结构级约束：禁止把目录移动到自己的子路径下；
  这既能减少路径竞争，也能避免在执行阶段才暴露更难理解的 Vault 级错误。
- `delete_path` 的确认文案如果只显示原始路径，用户很难感知目录删除的真实范围；
  最稳妥的做法是在确认 body 中附带“文件 / 目录 + 子项数量”摘要。
- Step 09 的有效验收口径应聚焦三点：
  - `move_path` / `delete_path` 已迁入单工具目录，并由 legacy 注册入口复用
  - 两个工具都默认接入 `checkPermissions()` 确认流，且 `isConcurrencySafe()` 为 false
  - 定向测试通过，且 `tsc` 二次筛查未报告本步文件新增类型错误

## 2026-04-02 路线图 Step 10 发现

- Web 域最稳妥的迁移方式仍是“旧入口薄桥接，新目录成事实来源”：
  - `fetch-tools.ts` 继续作为 legacy 兼容入口，但真实 `fetch` 工厂应落在 `src/tools/web/fetch/**`
  - `fetch-wrapper-tools.ts` 继续组装 wrapper，但真实 `fetch_webpage` /
    `fetch_webpages_batch` 工厂应分别落在各自目录
  - `bing-search-tools.ts` 也应只保留 re-export 角色，避免继续承载大段解析逻辑
- `fetch` 作为兼容型多模式工具，schema 若仍把 `url` 设为结构级必填，会和“`urls` 模式忽略 `url`”
  的兼容语义冲突；更稳的做法是把 `url` 改为可选，再用 `validateInput()` 表达
  “至少提供 `url` 或 `urls` 其一”。
- 长网页抓取最适合接入轻量进度事件，而不是改写最终输出格式：
  - 开始抓取时上报当前 URL / 批量数量
  - 命中分页截断提示时上报“可继续分页读取”
  - 保持最终字符串/JSON 输出不变，避免破坏现有调用方
- `chat-tool-wrapper-surface.test.ts` 与 `tool-selection-regression.test.ts` 在当前 Node 入口下会先撞到
  `obsidian` 模块解析基线，而不是 Step 10 本身的实现错误；因此本步的最小有效验证应调整为：
  - Web 定向测试覆盖 schema、进度摘要与 legacy 桥接
  - 通过 `tsc` 二次筛查确认 Web 迁移文件无新增类型错误

## 2026-04-02 路线图 Step 11 发现

- Script 域也适合沿用“旧入口薄桥接，新目录成事实来源”的迁移方式：
  - `script-tools.ts` 继续保留 `createScriptTools()` 聚合入口
  - 真实 `run_script` / `run_shell` 工厂应分别落在 `src/tools/script/run-script/**`
    与 `src/tools/script/run-shell/**`
- `run_shell` 不能只靠静态 `destructiveHint` 表达风险；更稳妥的做法是：
  - 用命令模式推断动态风险，区分 `read-only` / `mutating` / `destructive` / `unknown`
  - 所有桌面端 shell 执行默认进入确认流
  - destructive 命令上调到 `destructive` 风险，未知命令维持 `escape-hatch`
- `run_script` 的“中断语义”需要和真实运行时能力一致：
  - 当前运行时可以在开始前、`call_tool()` 边界和外部 abort 信号到达时停止
  - 但无法安全抢占任意正在执行的纯 JS 代码段
  - 因此工具层最诚实的声明是 `interruptBehavior = block`，而不是假装完全可取消
- `run_script` 的执行摘要不需要改返回格式；最小有效方式是：
  - 用 `getToolUseSummary()` 提供脚本首行/首段摘要
  - 在脚本内部每次调用 `call_tool()` 时，通过 `reportProgress()` 回传“第 N 步正在调用哪个工具”
- `chat-tool-selection-coordinator` 与 `chat-tool-task-signature` 需要补一个 `run_script`
  的显式 workflow 用例；否则 Step 11 只迁移工具实现，无法证明 workflow policy 仍然正确。
- `tool-selection-regression.test.ts` 在当前 Node 入口下依然先撞到 Vault 侧 `obsidian` 模块解析基线；
  因此 Step 11 的最小有效验收口径应聚焦三点：
  - Script 定向测试覆盖 `run_shell` 确认流与桌面端执行兼容
  - workflow 路由定向测试覆盖 `run_script` 显式意图
  - `tsc` 二次筛查确认 Script 迁移文件无新增类型错误

## 2026-04-02 路线图 Step 12 发现

- Time 域也适合沿用“旧入口薄桥接，新目录成事实来源”的迁移方式：
  - `time-tools.ts` 继续保留 `createTimeTools()` 兼容入口
  - `time-wrapper-tools.ts` 继续保留 wrapper 聚合入口
  - 真实 `get_time` / `get_current_time` / `convert_time` / `calculate_time_range`
    工厂应分别落在各自目录中
- Step 12 的关键不是改变时间计算逻辑，而是把 `get_time` 的模式判断前移到
  `validateInput()`：
  - `current` 模式禁止混入 `convert` / `range` 字段
  - `convert` 模式在校验期就要求 `source_timezone`、`target_timezone`、`time`
  - `range` 模式在校验期就要求 `natural_time`
  - 这样 `execute()` 可以只负责按 mode 分派，而不是继续混杂结构判断
- wrapper 与 legacy `get_time` 的兼容性里，`current` 模式最容易在测试里出现
  时间戳抖动；稳妥的验收方式应比较到秒级或比较除 `datetime` 毫秒尾数外的有效负载，
  避免把 1ms 级差异误判为回归。
- 候选路由对时间 wrapper 的偏好仍由现有 candidate resolver 承担；
  Step 12 需要确认的是迁移后没有破坏这条偏好，而不是重做一套新的路由规则。

## 2026-04-02 路线图 Step 22 发现

- Dataview 更适合作为可选 integration 域能力，而不是默认 core builtin 能力；
  最稳妥的暴露方式是在 `createIntegrationTools(app)` 阶段先做 capability gating，
  插件缺失时直接返回空数组，而不是注册后再依赖 discovery 隐藏。
- 仅靠“缺失时不暴露”还不够；显式工具名调用、旧上下文缓存或测试直调仍可能触达
  `dataview_query`，因此工具级 `validateInput()` 与 `execute()` 也必须返回清晰的
  “未安装或未启用 Dataview”错误，形成双层保护。
- Step 22 不需要引入 npm 级 Dataview 依赖；当前实现通过 `app.plugins.getPlugin('dataview')`
  读取运行时 API，并在工具内部自建最小 `DataviewQueryApi` 契约，足以满足只读查询。
- 现有仓库目录约定使用 `src/tools/integration/**` 单数域名；因此 Step 22 虽然路线图文案写的是
  `integrations`，实际落点保持在既有 `integration` 目录更符合仓库现状，没必要为了文档复数形式
  再新开一层目录。
- Step 22 的最小有效验证不需要真实安装 Dataview 插件；用 fake API 即可覆盖：
  - capability gating
  - clear unavailable reason
  - query / queryMarkdown 双通道
  - 结构化结果与 Markdown 预览裁剪
  - runtime 注册链源码断言
- `chat-tool-wrapper-surface.test.ts` 与 `tool-selection-regression.test.ts` 依然会经由
  Vault wrapper 链路先撞到 `obsidian` 模块解析基线；因此 Step 12 的最小有效验收口径应聚焦三点：
  - Time 定向测试覆盖 `validateInput()` 前移与 wrapper/legacy 结果兼容
  - candidate resolver 回归继续证明 wrapper 优先于 legacy `get_time`
  - `tsc` 二次筛查确认 Time 迁移文件无新增类型错误

## 2026-04-02 路线图 Step 13 发现

- Link / Plan / Skill 域适合继续沿用“旧入口薄桥接，新目录成事实来源”的收尾迁移方式：
  - `link-tools.ts` 继续保留 `createLinkTools()` 聚合入口
  - `plan-tools.ts` 继续保留 `createPlanTools()` 聚合入口
  - `skill-tools.ts` 继续保留 `createSkillTools()` 聚合入口与常量 re-export
- `get_first_link_path` 的真正边界不在 zod 的 `min(1)`，而在“清理掉 `[[ ]]`、别名、标题后是否还剩目标名”；
  因此最合适的迁移方式是把这层检查补到 `validateInput()`，而不是继续塞在执行分支里。
- `write_plan` 需要保持 `PlanState` 作为单一事实来源，但仍值得把两类明显错误前移到
  `validateInput()`：
  - 同一时间出现多个 `in_progress`
  - `done` / `skipped` 任务缺少 `outcome`
  这样可以在不破坏现有 `PlanState.update()` 约束的前提下，把错误更早反馈给执行器。
- Skill 域的关键不是“改成结构化返回”，而是保持特殊返回格式兼容：
  - `discover_skills` 继续以对象结果返回技能列表，但异常时仍兼容返回错误字符串
  - `invoke_skill` 继续返回带 `Base Path`、`<invocation-args>`、`<command-name>` 的字符串载荷
  - 因此 Step 13 不应强行把 Skill 工具统一成单一 JSON 输出 schema
- workflow 路由对 Skill / Plan 的识别依赖现有 `chat-tool-task-signature` 与
  `chat-tool-selection-coordinator`；
  Step 13 需要验证的是迁移后这些路由仍保持行为一致，而不是再引入新的 workflow 判定规则。
- 完成 Step 13 后，`BuiltinToolsRuntime` 下剩余的 `BuiltinTool[]` 工厂都已转为“桥接聚合 +
  单工具目录事实来源”模式；后续 Step 14 的重点应转向 surface 收敛与非 `BuiltinTool`
  体系检查，而不是继续做同类目录搬迁。

## 2026-04-02 路线图 Step 14 发现

- Step 14 的真正风险点不在工具执行，而在 discovery surface 的“事实来源漂移”：
  - 如果蓝图文件继续保留所有工具的完整 metadata，就会和邻近 `surface` 双轨并存
  - 如果一次性删光蓝图，又会让没有邻近 `surface` 的 stub / legacy 入口失去既有路由语义
  - 因此最稳妥的收口方式是改成三层：
    - migrated builtin tool 优先读邻近 `surface`
    - 未迁移 builtin tool 走 override
    - 缺少邻近元数据时走 legacy bridge
- `chat-tool-selection-coordinator.test.ts` 暴露了一个关键兼容面：
  某些测试和潜在调用方会直接构造“不带邻近 `surface` 的 builtin stub”。
  如果没有 legacy bridge，`read_file`、`run_shell`、`write_plan`、Skill 等工具会被降级成
  `builtin.misc`，从而破坏 workflow / candidate routing。
- 因此 Step 14 里“legacy bridge”的职责不是继续充当事实来源，而是为以下场景兜底：
  - 测试里的 builtin stub
  - 尚未补邻近元数据的旧入口
  - 过渡期里故意省略 `surface` 的兼容对象
- `sub-agents` 这条线当前仍然清晰地属于独立 `ToolDefinition + ToolExecutor` 体系：
  - 定义来自 `subAgentTools.ts`
  - 执行来自 `SubAgentToolExecutor.ts`
  - runtime resolver 只是把它们拼接进 catalog / executor 组合
  - 因此 Step 14 不应尝试把它们并入 `BuiltinTool`
- `chat-tool-runtime-resolver-support.ts` 本轮核查后无需修改：
  现有的 filesystem routing hint 和 builtin server 归并逻辑仍适合作为 runtime 侧辅助层，
  不承担工具 surface 真相，因此不需要再搬元数据进去。
- 由于 legacy bridge 兜底表一补齐，`chat-tool-discovery-blueprints.ts` 很容易重新超过
  单文件 500 行约束；因此本轮最终把预设表拆到了独立的
  `chat-tool-discovery-blueprint-presets.ts`，保留 `chat-tool-discovery-blueprints.ts`
  只负责 fallback / base-resolve 逻辑和说明文字。
- `chat-tool-wrapper-surface.test.ts` 与 `tool-selection-regression.test.ts` 本轮再次直接执行时，
  依然先被 Vault wrapper 链路中的 `obsidian` 模块解析基线挡住；
  这说明 Step 14 的有效回归口径应为：
  - surface adapter / candidate / selection / task signature 回归通过
  - sub-agent 独立执行链回归通过
  - wrapper / regression 测试已尝试，但阻塞点被明确记录为仓库现有环境基线

## 2026-04-02 路线图 Step 15 发现

- `ask_user` 不能复用 `requestConfirmation()`：
  - 权限确认是“是否允许执行既定动作”
  - 用户澄清是“动作本身仍未确定，需要先补全输入”
  - 如果混用同一通道，模型无法区分“被拒绝执行”和“需要补充意图”
- 当前 provider 工具循环虽然已经支持 `ToolExecutionOptions`，但实际多数调用点只透传
  `abortSignal`；因此 Step 15 的关键不只是新增工具目录，还必须把
  `requestToolUserInput` 从 `BaseOptions` 贯通到 OpenAI / Claude / Ollama / Poe
  等工具执行链路。

## 2026-04-02 路线图 Step 23 发现

- 当前 builtin runtime 的真实范围，已经不是 4 月 1 日 release note 能完整覆盖的状态；
  如果不补 architecture / ADR / release note，后续会继续把 4 月 2 日新增工具误当成
  “未正式落档能力”。
- `BuiltinToolsRuntime.ts` 现在已经稳定汇总：
  - script / workflow / time / vault / web / link / graph
  - obsidian commands
  - canvas
  - optional MCP resources
  - optional Dataview integration
  - skills
  这组范围需要明确写进架构与发布说明，不能只散落在 runtime 注册代码里。
- 4 月 2 日路线图并不是字面意义上的“100% 完整迁移”：
  `search_content` 与 `query_index` 仍在 `src/tools/vault/filesystemSearchHandlers.ts`，
  是当前唯一剩余的 builtin legacy island。
- Step 23 的正确收口方式不是掩盖这个例外，而是把它升级为显式记录：
  - 架构文档写明当前事实来源与已知例外
  - ADR 写明 builtin runtime 的当前目录事实来源与范围边界
  - release note 写明“可发布口径”和“严格完成路线图时仍需回补 Step 07”
- 历史上的 step-suffixed regression test 文件虽看起来像阶段标记，但它们是回归锚点，
  不是 runtime surface 或 registry 的 legacy bridge；因此本轮不需要为“清理标记”而重命名这些测试文件。
- `docs/designs/2026-04-02-builtin-tool-architecture-upgrade.md` 顶部的“提议中”状态

## 2026-04-02 路线图 Step 23 回归修复发现

- Step 23 的最终回归阻塞并不在发布文档本身，而在 taste / lint 基线遗留：
  - Dataview 序列化 helper 有空 `catch`
  - `BuiltinToolExecutor` 有未使用的 caught error
  - `canvas-document.ts` 超过 500 行
  - 多个 Vault / Web 兼容入口仍是 barrel re-export
- `src/tools/canvas/_shared/canvas-document.ts` 最稳妥的收口方式是把共享类型拆到邻近文件，
  保持原有对外入口不变；这样既能过 `taste/max-lines`，也不会打断 `read_canvas` /
  `edit_canvas` 的现有导入路径。
- 清理 barrel export 时，`src/tools/vault/filesystemWrapperSupport.ts` 不能简单改成
  顶层值导入 service 文件；否则测试环境会提前解析依赖 `obsidian` 的模块。
  最稳妥的做法是在 support 文件内保留窄参数 builder，继续作为纯兼容 surface helper。
- `filesystemWrapperSupport.ts` 对外暴露的 builder 语义应保持“wrapper 窄 schema → legacy
  list_directory 必需字段映射”，而不是把 service 层的默认字段一并泄漏给 surface 测试。
- Step 23 在修完上述阻塞后，完整回归已经恢复全绿：
  - `npm run lint`
  - `npm run test`
  - `npm run build`

## 2026-04-02 路线图 Step 07 发现

- `search_content` 与 `query_index` 的真实迁移边界，不只是把执行逻辑从
  `filesystemSearchHandlers.ts` 挪走；还必须把邻近 `surface` / `runtimePolicy`
  放回各自 `tool.ts`，否则 Step 14 收口后的“工具邻近元数据为事实来源”会再次失真。
- 这两个工具迁移完成后，`chat-tool-discovery-blueprint-presets.ts` 中对应条目
  不应再继续放在 builtin override；最稳妥的收口方式是转入 legacy bridge，
  仅为测试 stub 和缺少邻近 metadata 的兼容对象兜底。
- `query_index` 原先的 `requiredArgsSummary` 写成了 `data_source + query`，
  与真实 schema 不一致；迁移时应一并修正为 `data_source + select`，
  否则会继续把错误参数心智扩散到 discovery surface。
- `filesystemSearchHandlers.ts` 在 Step 07 完成后应降为薄桥接：
  只负责注册新目录工厂与保留 `stat_path`，不再承载搜索/索引 schema、description
  或业务逻辑。
- Step 07 的定向验证口径已经补齐：
  - `src/tools/vault/search-step7.test.ts`
  - `src/core/agents/loop/tool-call-argument-completion.test.ts`
  - `src/core/chat/services/chat-tool-task-signature.test.ts`
  - `src/core/chat/services/tool-selection-regression.test.ts`
  在当前仓库事实下已经失真，应该改为“已实施，并保留已知 legacy 例外”。
- `ask_user` 最稳妥的结果形态仍应保持简单：
  - 选项回答返回 `selected_value`
  - 自由文本回答返回 `free_text`
  - 用户取消或宿主无 UI 能力时，不返回“answered=false”的伪成功，而是走结构化失败
- 宿主侧不需要先做复杂聊天内嵌组件，使用独立 modal 即可满足 Step 15 的“host 通道”
  要求；关键是能力边界清晰：
  - 支持 options 和自由文本
  - 关闭 / 取消明确映射为 `cancelled`
  - 与权限确认弹窗完全分离
- `BuiltinToolExecutor.ts` 在这一步很容易再次突破 500 行；
  因此新增的交互闭包已下沉到 `builtin-tool-executor-support.ts`，
  保持执行器主体仍符合工程约束。

## 2026-04-02 路线图 Step 16 发现

- `append_daily_note` 的关键不是“再包一层 `write_file`”，而是把 daily note 规则收敛到工具内部：
  - 目标日期只让模型给 `YYYY-MM-DD`
  - 真实文件路径由工具读取 `.obsidian/daily-notes.json` 后自行解析
  - 这样才能满足“路径解析不依赖模型猜测”的验收标准
- 为了遵守项目里“不要直接访问 `app.internalPlugins`”的原则，最稳妥的方案是直接读取
  `.obsidian/daily-notes.json`，再结合 `moment` 格式化出目标路径，而不是耦合 internal plugin 实例。
- daily note 路径解析至少要稳定覆盖三层语义：
  - `folder`
  - `format`
  - `.md` 后缀补齐
  否则模型即使只给出正确日期，也仍可能写到错误位置。
- `section_heading` 的最佳边界是“正文插入语义”，不是通用文档重写：
  - 标题已存在时，插到该 section 末尾、下一个同级或更高级标题之前
  - 标题不存在时，在文末补一个 `## 标题`
  - 不传标题时，保持简单的文末追加
- 当前 Node 测试环境没有 `obsidian` 运行时包，因此 Step 16 的最小有效验证口径需要调整为：
  - schema 只暴露 `date` / `content` / `section_heading`
  - helper 源码明确读取 `.obsidian/daily-notes.json` 并内部完成路径拼装
  - legacy 注册入口已复用 `createAppendDailyNoteTool(app)`
  - 再配合 `tsc` 二次筛查确认本步文件无新增相关类型错误

## 2026-04-02 路线图 Step 17 发现

- `property_edit` 的关键不是“给 `edit_file` 包一层别名”，而是把 frontmatter 变更语义单独结构化：
  - `set`
  - `delete`
  - `append`
  - `remove`
  这样模型只需要表达属性操作，不需要再手写 YAML 锚点与缩进。
- frontmatter 读写最稳妥的落点是 Vault 域共享 helper，而不是散落在工具 service 中重复写正则：
  - 统一解析开头的 YAML block
  - frontmatter 非对象或未闭合时直接报错
  - 回写时只重建 frontmatter，不介入正文编辑语义
- 这一步最值得复用的不是旧工具，而是现有属性类型系统：
  - `convertFrontmatterValue(app, key, value, { strictMode: true })`
  - 这样 `property_edit` 可以自动对 checkbox、number、date、tags、multitext 等属性做一致转换，
    而不是新增一套与现有 Properties 行为脱节的类型推断。
- `delete` / `remove` 与 `set` / `append` 的风险并不相同；最小但有价值的确认流是：
  - `set` / `append` 直接放行
  - `delete` / `remove` 走 ask，并上调到 destructive
  这样既满足结构化编辑的效率，也避免 silent 删除属性值。
- Step 17 的边界必须明确保持在 frontmatter：
  - 只支持 Markdown 文件
  - 只修改 YAML frontmatter / Properties
  - 不扩张为正文 patch 或混合文档编辑工具
- 当前 Node 测试环境没有 `obsidian` 运行时包，因此 Step 17 的最小有效验证口径需要调整为：
  - schema 覆盖四类属性操作
  - helper 源码明确负责 YAML 解析与回写
  - legacy 注册入口已复用 `createPropertyEditTool(app)`
  - 再配合 `tsc` 二次筛查确认本步文件无新增相关类型错误

## 2026-04-02 路线图 Step 18 发现

- `backlink_analyze` 的关键不是“再做一个链接搜索器”，而是把 Obsidian metadata cache
  已经维护好的图谱语义转成稳定工具输出：
  - `getBacklinksForFile(file)` 适合拿 incoming
  - `getFileCache(file)` 中的 `links` / `frontmatterLinks` / `embeds` 适合拿 outgoing
  - `mutual` 只需要对 incoming 与 outgoing 的目标路径做交集
- Step 18 的第一阶段边界必须明确锁死在一跳邻居分析：
  - schema 可以保留 `depth`
  - 但 `validateInput()` 必须明确拒绝 `depth=2`
  - 否则模型会自然把它当成可递归图查询，超出当前实现能力
- 出链分析如果只看正文 `links`，会漏掉 frontmatter 和 embed 关系；
  因此更稳妥的一跳实现应统一汇总：
  - `links`
  - `frontmatterLinks`
  - `embeds`
  再按解析后的目标路径聚合计数
- 解析 outgoing 时最容易踩的坑不是计数，而是 link resolution：
  - 现有仓库已经在 `get_first_link_path` 中使用 `getFirstLinkpathDest`
  - `backlink_analyze` 应优先沿用这一路径，而不是自己猜 vault 内部 link 解析规则
- 图谱工具应保持只读和 candidate-only：
  - 这是“理解笔记关系”的工具，不是编辑工具
  - 也不是用户每轮都必须看到的 default 工具
  - 最适合通过邻近 `surface` 在候选阶段被动暴露
- 当前 Node 测试环境没有 `obsidian` 运行时包，因此 Step 18 的最小有效验证口径需要调整为：
  - schema 明确保留一跳 backlink 分析的输入输出边界
  - service 源码明确使用 metadata cache 的入链/出链能力
  - `BuiltinToolsRuntime` 已接入 `createGraphTools(options.app)`
  - 再配合 `tsc` 二次筛查确认本步文件无新增相关类型错误

## 2026-04-02 路线图 Step 19 发现

- Step 19 的关键不是“把 command palette 暴露给模型”，而是把命令 discover 与 invoke 明确拆成两个工具：
  - `list_commands` 负责发现与筛选
  - `run_command` 负责执行已知 `command_id`
  这样模型不会跳过 discover 直接凭空猜命令 id。
- 命令 discover 最稳妥的实现来源是 `app.commands.listCommands()`，而不是读某个内部 modal 状态：
  - 它直接给出当前可执行命令全集
  - 适合按 `query` 和 `plugin_id` 做轻量筛选
  - 也不需要依赖命令面板是否已打开
- 命令来源插件可以从 `command_id` 的前缀近似推断，但必须和 core 前缀区分开：
  - `app:`、`editor:`、`workspace:`、`command-palette:` 等应视作 core
  - 其他前缀可作为插件来源提示返回给模型
  这足以支持 Step 19 的 discover 语义，不必在本步引入更复杂的插件元数据联查。
- `run_command` 的安全边界必须放在权限流，而不是参数层：
  - 用户或模型只提供 `command_id`
  - 是否执行由 `checkPermissions()` 决定
  - 未知来源或未知风险命令应保守上调风险并要求确认
- 对 `run_command` 来说，“命令不存在”最适合在权限检查期就拒绝，而不是执行后返回伪失败：
  - 这样可以更早给出修复建议
  - 也能避免把“无效 id”误当成“命令执行失败”
- 当前 Node 测试环境没有 `obsidian` 运行时包，因此 Step 19 的最小有效验证口径需要调整为：
  - schema 明确保持 `list_commands` 的 discover 边界与 `run_command` 的 invoke 边界
  - service 源码明确使用 `app.commands.listCommands()` / `findCommand()` / `executeCommandById()`
  - `BuiltinToolsRuntime` 已接入 `createObsidianCommandTools(options.app)`
  - 再配合 `tsc` 二次筛查确认本步文件无新增相关类型错误

## 2026-04-02 路线图 Step 20 发现

- Step 20 的关键不是“把 MCP server 暴露给模型自己猜 URI”，而是把资源链路明确拆成 discover
  与 read 两个工具：
  - `list_mcp_resources` 先列出稳定的 `server_id`、`uri`
  - `read_mcp_resource` 只读取已知资源
  这样模型不会跳过 discover 直接猜 URI。
- 现有 MCP domain/runtime 已有 tool 能力，但没有资源能力；最小可行补齐点在 domain 契约与协议客户端：
  - `McpRuntimeManager` 新增 `getResourcesForServer()`、`readResource()`
  - `McpProtocolClient` 新增 `listResources()`、`readResource()`
  - `resources/list` 需要处理分页 `nextCursor`，否则资源多的 server 会只返回第一页。
- `list_mcp_resources` 不应因为某个已启用 server 不支持 resources capability 就整体失败；
  更稳妥的边界是：
  - runtime 按 server 读取资源时捕获失败并返回空数组
  - 工具层继续聚合其他 server 的资源
  这样“部分 server 无资源能力”不会拖垮整个 discover 结果。
- `read_mcp_resource` 的安全边界应同时收敛两层语义：
  - 只接受精确 `server_id` + `uri`
  - 保持只读，不承接 prompts/templates/tool call
  这样才能满足路线图里“避免模型凭空猜 URI”和“保持只读”的要求。
- MCP 资源内容不能无上限直灌给模型，尤其是大文本和二进制 blob；
  本步最小但必要的防护是：
  - 文本内容按工具输出上限截断
  - blob 的 base64 也按同一上限截断
  - 结果显式返回 `truncated`
  这样既能保留只读能力，也能避免资源体把上下文窗口打满。
- Step 20 的 builtin 接线不能只停留在工具目录里；
  还需要把当前 chat runtime 持有的 `mcpManager` 注入 `BuiltinToolsRuntime`，
  否则工具工厂无法拿到真实外部 MCP runtime，也就无法列资源或读资源。
- 当前 Node 测试环境没有 `obsidian` 运行时包，因此 Step 20 的最小有效验证口径需要调整为：
  - schema 明确保持 `list_mcp_resources` 的 discover 边界与 `read_mcp_resource` 的 read 边界
  - service 测试明确覆盖“先列后读”和 URI 不猜测的最小闭环
  - runtime 测试明确覆盖 `McpRuntimeManagerImpl` 对资源列表与资源读取的委托
  - `BuiltinToolsRuntime` 已接入 `createMcpResourceTools(options.mcpManager)`
  - 再配合 `tsc` 定向筛查确认本步改动文件无新增相关类型错误

## 2026-04-02 路线图 Step 21 发现

- Step 21 的关键不是“把 `.canvas` 当普通 JSON 文件直接做文本 patch”，而是把 Canvas 语义明确拆成读写两个工具：
  - `read_canvas` 负责节点、连线与布局摘要的只读输出
  - `edit_canvas` 负责结构化节点、位置、连线变更
  这样模型不会把读取和写入混成一次危险的大补丁。
- Canvas 的最稳妥共享落点是纯 helper，而不是把 JSON 解析和操作逻辑散落到 service：
  - `parseCanvasDocument()` 负责结构校验
  - `buildCanvasReadModel()` 负责节点/连线/summary 输出
  - `applyCanvasEditOperations()` 负责 add/update/move/remove 节点与连线
  这样测试可以在当前 Node 环境下直接运行，不依赖 `obsidian` 运行时包。
- `read_canvas` 的价值不只是“读出原始 nodes/edges”，还在于返回稳定摘要：
  - `node_count`
  - `edge_count`
  - `node_types`
  - `bounds`
  这样模型能先理解画布结构，再决定是否需要修改。
- `edit_canvas` 的边界必须锁定在结构化操作，不应退化成通用 JSON 文本修改器：
  - `add_node`
  - `update_node`
  - `move_node`
  - `remove_node`
  - `add_edge`
  - `update_edge`
  - `remove_edge`
  这已经覆盖了路线图要求的节点、位置和连线变更。
- 节点删除与连线删除的风险明显高于普通移动或更新；
  因此本步最合适的确认策略是：
  - `move_node` / `update_node` / `add_node` / `add_edge` 默认 allow
  - `remove_node` / `remove_edge` 进入确认流
  - 删除节点时若仍有关联连线，且 `remove_connected_edges=false`，应直接拒绝执行
- `edit_canvas` 不能只校验操作本身，还要校验图结构一致性：
  - 新增连线前必须确保 `from_node` / `to_node` 存在
  - 更新连线后也必须重新校验端点
  - 删除节点时要明确处理关联边
  这样才能避免生成“语法合法但图结构断裂”的 Canvas。
- 当前 Node 测试环境没有 `obsidian` 运行时包，因此 Step 21 的最小有效验证口径需要调整为：
  - schema 明确保留 `read_canvas` / `edit_canvas` 的读写分离边界
  - 纯 helper 测试明确覆盖 Canvas 摘要读取和结构化编辑闭环
  - 源码断言确认 `BuiltinToolsRuntime` 已接入 `createCanvasTools(options.app)`
  - 再配合 `tsc` 定向筛查确认本步改动文件无新增相关类型错误
