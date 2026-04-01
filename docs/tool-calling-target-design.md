# Tool Calling Target Design

状态：草案  
日期：2026-04-01

本文档基于当前仓库真实实现与 [tool-calling-audit.md](tool-calling-audit.md)
形成目标设计，不直接要求本轮重写业务实现。目标是为后续渐进式改造提供一套与
具体 API 栈解耦、但能直接映射到当前代码库的工具调用架构。

## 1. 设计目标与非目标

### 1.1 设计目标

1. 模型初始只看到极简 discovery 信息，而不是完整 schema。
2. 模型只对候选工具看到完整的可执行 schema。
3. 模型可见参数面尽量小，环境已知参数在运行时补全。
4. skill 只承载复杂流程，不给每个原子工具套 skill 外壳。
5. 在当前栈不支持原生 namespace + deferred loading 时，先提供等价的两阶段流程。
6. 一旦未来 API 栈支持 native namespace、allowed tools、deferred loading、tool_search，
   应能低成本迁移。
7. 保留当前执行器、provider loop 与工具实现，优先改 discovery、候选解析和 schema
   注入链路。

### 1.2 非目标

1. 不是这一轮就重写 BuiltinToolExecutor、McpToolExecutor 或 CompositeToolExecutor。
2. 不是这一轮就拆完所有高复杂工具的底层实现。
3. 不是强依赖 OpenAI、Anthropic、OpenRouter 任一 SDK 的实验接口落地。
4. 不是把现有每个工具都包装成 skill 或 sub-agent。
5. 不是为了“抽象优雅”而打破现有 provider 兼容链路。

设计决策原因：当前痛点在“暴露面”和“注入方式”，不是执行后端完全不可用。
如果先重写执行器，会同时放大行为回归面、provider 差异和 MCP 兼容风险。

## 2. 当前问题与目标映射

### 2.1 当前问题

当前实现的关键事实已经在审计文档确认：

1. 顶层聊天主链会在 [src/core/chat/services/chat-generation-for-model.ts](../src/core/chat/services/chat-generation-for-model.ts)
   中直接把完整 `requestTools` 注入 `providerOptions.tools`。
2. 工具聚合逻辑在 [src/core/chat/services/chat-tool-runtime-resolver.ts](../src/core/chat/services/chat-tool-runtime-resolver.ts)，
   已有 `explicitToolNames` 和 `explicitMcpServerIds` 两个很重要的筛选原语，但当前主聊天链路没有把它们用作两阶段过滤。
3. provider loop 已经在 [src/LLMProviders/provider-shared.ts](../src/LLMProviders/provider-shared.ts)
   和 OpenAI / Claude loop 中支持 `getTools`，但顶层聊天没有接线，而且当前语义仍是
   “刷新完整工具集”。
4. builtin 工具 schema 在 [src/tools/runtime/tool-registry.ts](../src/tools/runtime/tool-registry.ts)
   中由 Zod 直接展开为 JSON Schema；这非常适合作为实现真相，但不适合作为 discovery 面。
5. MCP runtime 在 [src/domains/mcp/runtime/runtime-manager.ts](../src/domains/mcp/runtime/runtime-manager.ts)
   的 `getToolsForModelContext()` 当前会走 `getAvailableToolsWithLazyStart()`，意味着 discovery
   阶段也可能为所有启用 server 付出连接成本。
6. 参数修正、别名、兼容与恢复逻辑已经散落在 [src/services/mcp/toolHints.ts](../src/services/mcp/toolHints.ts)
   与 `mcpToolCallHandler` 一带，这说明“模型经常接近正确，但不够稳定”。

### 2.2 问题到目标的映射

| 当前问题 | 直接后果 | 目标设计响应 | 为什么这样做 |
| --- | --- | --- | --- |
| 全量 schema 注入 | token 膨胀、上下文压缩提前、工具误选 | 引入 Discovery Layer 和 Candidate Resolution Layer | 先缩小模型选择面，再谈参数稳定 |
| 工具元信息和执行 schema 混在一起 | description 既承担路由又承担文档，越来越长 | 把 discovery metadata、executable schema、runtime policy、compat metadata 拆开 | 不同消费者需要的信息完全不同 |
| builtin 工具家族边界被压平到 `BUILTIN_SERVER_ID` | 模型只能看到 22+ 个扁平函数名 | 恢复逻辑 family / namespace，但不立刻改执行器 | 先恢复认知边界，再决定是否改底层 server 结构 |
| MCP discovery 会懒启动所有启用 server | discovery 成本与外部配置线性增长 | 为 MCP 增加 scoped discovery / scoped executable resolve | discovery 阶段不应为所有 server 付出连接成本 |
| 编排类工具与原子工具同权竞争 | `run_script` / `Skill` / `sub_agent_*` 抢路由 | workflow 单独建面，默认不进入原子工具 discovery | 复杂流程和原子动作不是同一层问题 |
| 参数兼容逻辑分散 | 模型构参不稳定，靠长 description 补偿 | 引入 Runtime Argument Completion Layer 和统一 Validation Layer | 把“靠提示词纠偏”改成“系统补全 + 校验 + 修复” |
| provider 丢失 `source` / `sourceId` / `annotations` | 无法向 native namespace 平滑迁移 | 新增 upgrade compatibility metadata 与 adapter | 先保留身份信息，再决定如何向 provider 发出 |

### 2.3 保留现状与必须重构的部分

应保留的部分：

1. [src/core/agents/loop/CompositeToolExecutor.ts](../src/core/agents/loop/CompositeToolExecutor.ts)
   的执行分发方式。
2. builtin 与 MCP 的真实执行实现，包括 `BuiltinToolExecutor`、`McpToolExecutor`、
   `mcpToolCallHandler` 的失败恢复逻辑。
3. [src/core/chat/services/chat-tool-runtime-resolver.ts](../src/core/chat/services/chat-tool-runtime-resolver.ts)
   现有的 `explicitToolNames` / `explicitMcpServerIds` 过滤原语。
4. [src/tools/runtime/tool-registry.ts](../src/tools/runtime/tool-registry.ts)
   中 Zod schema 作为 builtin 实现真相。
5. provider 的现有 tools / getTools / toolExecutor 接口面。

必须重构的部分：

1. discovery 信息的组织方式。
2. 顶层聊天的工具注入时机与注入范围。
3. MCP runtime 的 scoped 查询能力。
4. 参数补全与校验的统一抽象。
5. workflow 能力与原子工具的默认暴露边界。

## 3. 新的抽象分层

### 3.1 总览

目标架构分成七层。关键原则是：当前的 `ToolDefinition` 不再作为“工具真相”，而只作为
“当前 provider 可执行负载”的编译产物。

```text
User Turn
  -> Tool Discovery Layer
  -> Candidate Resolution Layer
  -> Executable Schema Layer
  -> Runtime Argument Completion Layer
  -> Validation Layer
  -> Execution Layer
  -> Tool Result

Future Native Deferred-Loading Adapter
  -> 覆盖 Discovery / Executable Schema 的 provider 输出方式
```

### 3.2 分层定义

| 层 | 职责 | 输入 | 输出 | 当前代码映射 | 先落地还是后置 |
| --- | --- | --- | --- | --- | --- |
| Tool Discovery Layer | 生成极简工具发现目录，只暴露路由所需信息 | 会话上下文、功能开关、可用 builtin / MCP / workflow 能力 | `DiscoveryCatalog` | 当前无独立层；可复用 `BuiltinToolsRuntime.listTools()`、`SkillScannerService.scan()`、`McpRuntimeManager.getEnabledServerSummaries()` 作为原料 | 先落地 |
| Candidate Resolution Layer | 根据 discovery 信息做粗筛选，决定直接回答、原子工具、还是 workflow | 用户 turn、历史摘要、discovery catalog、上轮 scope cache | `CandidateScope` | 当前隐含在模型对全量工具的直接选择里；可复用 resolver 的 explicit filters 落地 | 先落地 |
| Executable Schema Layer | 仅为候选工具加载最小可执行 schema，并编译为当前 provider payload | `CandidateScope`、运行时可用性 | `ExecutableToolSet` | 当前等同于 `resolveToolRuntime()` 返回的 `requestTools`；需要改为 scope-aware 输出 | 先落地 |
| Runtime Argument Completion Layer | 填充环境已知参数，做别名、类型 coercion、默认值和上下文补全 | 模型 tool call、tool policy、会话环境 | `CompletedToolCall` | 当前散落于 `toolHints.ts`、`mcpToolArgHelpers`、builtin executor 前的 parse | 先落地 |
| Validation Layer | 对补全后的参数做统一校验，并给出结构化修复提示 | `CompletedToolCall`、validation contract | `ValidatedToolCall` 或 `ToolValidationError` | 当前 builtin 走 Zod parse，MCP 走 `validateToolArgs()` + failure hint | 先落地 |
| Execution Layer | 调度真正执行器并产出记录 | `ValidatedToolCall`、candidate tool set | `ToolCallResult`、执行记录 | 当前 `CompositeToolExecutor`、`BuiltinToolExecutor`、`McpToolExecutor` | 保留现状，轻改接线 |
| Future Native Deferred-Loading Adapter | 把抽象层输出映射到 provider 原生 namespace / allowed_tools / tool_search | `DiscoveryCatalog`、`CandidateScope`、provider capability matrix | provider-native payload | 当前不存在；未来在 provider 适配层新增 | 后置 |

### 3.3 关键抽象对象

建议引入以下抽象对象，但不要求第一阶段全部完整实现：

```ts
interface ToolIdentity {
  stableId: string
  familyId: string
  source: 'builtin' | 'mcp' | 'workflow' | 'escape-hatch'
  sourceId: string
  providerCallName: string
}

interface DiscoveryCatalog {
  version: number
  entries: DiscoveryEntry[]
  workflowEntries: DiscoveryEntry[]
  serverEntries: DiscoveryServerEntry[]
}

interface CandidateScope {
  mode: 'no-tool' | 'atomic-tools' | 'workflow'
  candidateToolIds: string[]
  candidateServerIds: string[]
  reusePreviousScope: boolean
}

interface ExecutableToolSet {
  tools: ToolDefinition[]
  toolExecutor?: ToolExecutor
  getTools?: GetToolsFn
  scope: CandidateScope
}
```

设计决策原因：先把“工具身份”“工具发现”“工具执行负载”拆开，才能同时兼容当前扁平
调用和未来 native namespace。若继续把 `ToolDefinition.name` 当唯一身份，后续任何升级
都会被当前 flat name 绑死。

### 3.4 推荐的逻辑 namespace / family

即使当前 provider 侧仍是 flat function name，也要先恢复逻辑分组。建议采用：

1. `builtin.vault.discovery`
2. `builtin.vault.read`
3. `builtin.vault.write`
4. `builtin.vault.search`
5. `builtin.web.fetch`
6. `builtin.web.search`
7. `builtin.time`
8. `workflow.plan`
9. `workflow.skill`
10. `workflow.delegate`
11. `escape.shell`
12. `mcp.<serverId>`

设计决策原因：当前 [src/tools/runtime/constants.ts](../src/tools/runtime/constants.ts)
把 builtin 收口到一个 `BUILTIN_SERVER_ID` 是执行兼容上的合理取舍，但 discovery 层如果也
只有这一个 server，就丢掉了模型最需要的“边界感”。

## 4. 新的工具信息结构

### 4.1 分层原则

一个工具不再只有一个“巨大的 schema 对象”，而是拆成四层：

1. discovery metadata
2. executable schema
3. runtime policy / execution hints
4. upgrade compatibility metadata

四层可以由同一个 `ToolIdentity` 关联，但必须避免再次混成一个巨型对象。

### 4.2 discovery metadata

建议字段：

| 字段 | 作用 |
| --- | --- |
| `stableId` | 稳定工具身份，不依赖当前 provider 的 flat name |
| `familyId` | discovery 分组，如 `builtin.vault.read` |
| `displayName` | 给模型看的短名称 |
| `oneLinePurpose` | 一句话用途，控制在短 token 面 |
| `whenToUse` | 1 到 3 条短条件 |
| `whenNotToUse` | 1 到 2 条短排除条件 |
| `requiredArgsSummary` | 只列模型真正需要提供的 1 到 3 个关键参数 |
| `riskLevel` | `read-only`、`mutating`、`destructive`、`escape-hatch` |
| `argumentComplexity` | `low`、`medium`、`high` |
| `discoveryVisibility` | `default`、`candidate-only`、`workflow-only`、`hidden` |
| `capabilityTags` | 路由标签，如 `path-discovery`、`content-search`、`timezone` |
| `serverHint` | 外部 MCP 时的 server 归属摘要 |

不应包含：

1. 完整 JSON Schema。
2. 冗长示例。
3. 错误恢复长文档。
4. provider 专有字段。
5. 所有兼容别名和 coercion 细节。

设计决策原因：discovery 的职责是“帮助选中正确候选”，不是“教模型如何构造所有字段”。

### 4.3 executable schema

建议字段：

| 字段 | 作用 |
| --- | --- |
| `stableId` | 与 discovery 对齐 |
| `providerCallName` | 当前 provider 真正调用的名字，第一阶段可继续等于现有工具名 |
| `description` | 面向候选集合的简短执行描述，不再塞完整路由教程 |
| `inputSchema` | 模型可见的最小可执行 schema |
| `outputSchema` | 可选，供结构化结果与未来 native 能力使用 |
| `strictness` | 是否强校验、是否允许额外字段 |

不应包含：

1. `serverId` 这类环境已知参数。
2. 冗长的“什么时候用 / 不用”说明。
3. 所有运行时默认值。
4. 仅对内部兼容有意义的 alias 信息。

设计决策原因：第二阶段给模型看的“完整 schema”应当是“完整可调用 schema”，而不是
“底层实现所有内部旋钮”。

### 4.4 runtime policy / execution hints

建议字段：

| 字段 | 作用 |
| --- | --- |
| `selectionPolicy` | 是否默认隐藏、是否需要显式用户意图、是否允许自动选择 |
| `argumentAliases` | 参数别名映射 |
| `valueCoercions` | `integer`、`boolean` 等 coercion 规则 |
| `completionRules` | 运行时补全规则，如默认 timezone、默认 view、上下文注入 |
| `validationRules` | 互斥、依赖、危险参数检查 |
| `approvalPolicy` | `none`、`confirm`、`manual` |
| `timeoutClass` | 用于执行层默认超时策略 |
| `retryPolicy` | 参数修复后是否允许重试 |
| `resultHandling` | 截断、摘要、结构化记录策略 |

不应包含：

1. 面向模型的发现说明。
2. provider-native namespace 字段。
3. 完整原始 schema 文档。

设计决策原因：当前 [src/services/mcp/toolHints.ts](../src/services/mcp/toolHints.ts)
已经证明这些信息存在真实需求，但它们不应该继续藏在长 description 里。

### 4.5 upgrade compatibility metadata

建议字段：

| 字段 | 作用 |
| --- | --- |
| `stableId` | 稳定身份 |
| `version` | 元数据版本，支持渐进演进 |
| `legacyCallNames` | 旧 flat name 别名，如 `stat_path` |
| `legacyServerIds` | 旧 server id，如 `BUILTIN_SERVER_ID` 及 legacy builtin ids |
| `nativeNamespaceHint` | 未来 provider-native namespace 建议值 |
| `nativeToolNameHint` | 未来原生工具名建议值 |
| `supportsDeferredSchema` | 当前工具是否适合延迟加载 |
| `supportsToolSearch` | 未来是否可纳入 provider-native tool_search |
| `deprecationStatus` | 是否处于过渡别名阶段 |

不应包含：

1. discovery 说明文字。
2. 执行期动态状态。
3. 具体 provider request payload。

设计决策原因：升级兼容信息必须是稳定的桥接层，而不是再次变成 provider 细节垃圾桶。

### 4.6 当前代码如何映射到新结构

1. builtin 的原始 schema 继续来自 [src/tools/runtime/tool-registry.ts](../src/tools/runtime/tool-registry.ts)。
2. external MCP 的原始 schema 继续来自 runtime manager 连接后的 tool 列表。
3. `toolHints.ts` 的一部分内容迁入 runtime policy。
4. 当前 `ToolDefinition` 保留，但只作为 `Executable Schema Layer` 的编译产物。

## 5. 工具边界重构方案

### 5.1 总原则

1. 原子工具按“一个清晰动作”建边界。
2. 模式互斥的多语义工具优先做 discovery 层拆分，必要时用 wrapper 过渡。
3. workflow / orchestration / escape-hatch 与原子工具分面。
4. 不引入新的万能 `action` 工具。

### 5.2 建议保留的原子工具

| 当前工具 | 目标状态 | 原因 | 迁移方式 |
| --- | --- | --- | --- |
| `read_file` | 保留 | 已是明确的“读取已知文件内容”动作 | 仅缩减模型可见参数与说明 |
| `read_media` | 保留 | 边界清晰 | 仅补 discovery metadata |
| `write_file` | 保留 | 单一职责清晰 | 仅补 policy 与 approval |
| `edit_file` | 保留 | 语义明确，复杂度可控 | 先保留 `edits[]`，后续再评估简化 |
| `create_directory` | 保留 | 边界清晰 | 仅补 discovery metadata |
| `move_path` | 保留 | 边界清晰 | 仅补 discovery metadata |
| `delete_path` | 保留但默认高风险 | 不是构参难，而是行为风险高 | 增加 destructive policy |
| `open_file` | 保留 | 明确 UI 动作 | 仅补 discovery metadata |
| `get_first_link_path` | 保留 | 边界清晰 | 仅补 discovery metadata |
| `bing_search` | 保留 | web search 动作明确 | 归入 web.search family |

### 5.3 建议拆分的工具

| 当前工具 | 建议拆分目标 | 为什么 | 渐进式迁移方式 |
| --- | --- | --- | --- |
| `get_time` | `get_current_time`、`convert_time`、`calculate_time_range` | 当前 `mode` 互斥，模型容易误构参 | 第一阶段先用 wrapper 固定旧工具的 mode |
| `list_directory` | `list_directory`、`list_directory_tree`、`list_vault_overview` | 当前把 flat / tree / vault 塞进同一 schema | 第一阶段先用 wrapper 固定旧工具的 view |
| `fetch` | `fetch_webpage`、`fetch_webpages_batch`、`fetch_raw_content` | 当前单 URL / 批量 / raw / 提取混杂 | 第一阶段只把 `fetch_webpage` 放入默认 discovery |

设计决策原因：这些工具的问题不是执行能力不足，而是“一个 schema 承担了多个互斥动作”。
用 wrapper 先拆 discovery 与 executable schema，可以在不推倒底层实现的情况下先收获稳定性。

### 5.4 建议改名或至少改 discovery label 的工具

| 当前工具 | 建议稳定名 / discovery label | 为什么 | 兼容策略 |
| --- | --- | --- | --- |
| `stat_path` | `inspect_path` | `stat` 偏实现术语，且当前 routing hint 还存在 `get_file_info` 漂移 | 第一阶段保留 providerCallName=`stat_path` |
| `search_content` | `search_file_content` | 比 `search_content` 更直接地区分于路径发现和索引查询 | 第一阶段仅改 discovery label |
| `query_index` | `query_vault_index` | 当前更像结构化索引 DSL，不应与正文搜索混淆 | 第一阶段仅改 discovery label |

设计决策原因：这一步优先改“模型理解名”和 `stableId`，而不是强制立刻改底层实现名。

### 5.5 建议归并管理的能力

下列能力建议在控制面归并到同一个 workflow surface，但不要合并成一个模型可见的万能
`action` 工具：

| 当前能力 | 建议归并目标 | 为什么 |
| --- | --- | --- |
| `Skill` | `workflow.skill` | 本质是加载并执行复杂流程文档 |
| `sub_agent_*` | `workflow.delegate` | 本质是把任务委托给另一个代理系统 |
| `write_plan` | `workflow.plan` | 它维护流程状态，不是外部世界动作 |
| `run_script` | `workflow.orchestrate` | 它承担编排器角色，不适合作为普通原子工具 |

设计决策原因：这些能力确实应该归到同一类控制面中，但如果把它们继续做成一个
`workflow_action(type, ...)` 万能工具，只会把问题从原子层挪到 workflow 层。

### 5.6 建议降级为 candidate-only 或 workflow-only 的能力

| 当前能力 | 目标边界 | 为什么 |
| --- | --- | --- |
| `read_files` | candidate-only 批量工具 | 批量读取不是默认第一选择，应在路径已知且确实多文件时再暴露 |
| `query_index` | candidate-only 高复杂工具 | 当前是小 DSL，不应默认与普通搜索竞争 |
| `run_script` | workflow-only | 本质是编排器，不是原子动作 |
| `write_plan` | workflow internal action | 它操作会话计划状态，不是外部世界对象 |
| `Skill` | workflow-only | 它是工作流加载器，不是普通工具 |
| `sub_agent_*` | workflow-only，且不再一 agent 一工具平铺 | 本质是递归编排能力 |
| `run_shell` | explicit-only escape-hatch | 风险最高，只应在显式用户意图下可见 |

### 5.7 哪些能力更适合作为 skill / workflow

更适合作为 workflow 的场景：

1. 需要分步骤规划、跨多轮保留计划状态。
2. 需要组合多个原子工具完成一个复杂目标。
3. 需要调用 sub-agent 或 skill 内容本身。
4. 需要人工确认或有较强失败恢复流程。

不应做成 workflow 的场景：

1. 读取单个已知文件。
2. 搜索已知范围内内容。
3. 创建目录、移动路径、打开文件这类单步动作。
4. 单网页抓取和时间转换这类单一工具即可完成的动作。

### 5.8 绝不建议做成万能 action 工具的领域

绝对不要新造以下万能工具：

1. `filesystem_action(action, ...)`
2. `search_action(mode, ...)`
3. `web_action(mode, ...)`
4. `workflow_action(type, ...)`
5. `system_action(action, ...)`

设计决策原因：当前系统已经被 `get_time`、`list_directory`、`fetch` 的模式混合证明过，
“一个 action enum 统领多个语义”会同时恶化 discovery、构参稳定性与回归风险。

## 6. 两阶段流程详细设计

### 6.1 总览

在当前栈不支持 native namespace + deferred loading 时，采用自建两阶段流程：

```text
阶段 A：只给模型 discovery 信息，完成粗选择
阶段 B：系统只为候选工具加载可执行 schema，再让模型正式调用
```

这两个阶段内部允许再细分步骤，但原则不能变：阶段 A 不给完整 schema，阶段 B 不再回到
全量工具集合。

### 6.2 详细步骤

| 步骤 | 做什么 | 输入 | 输出 | 如何降 token | 如何提稳定性 | 未来可替换点 |
| --- | --- | --- | --- | --- | --- | --- |
| 0. Availability Snapshot | 收集当前启用的 builtin family、MCP server 摘要、workflow 可用性、feature flag | 设置、session、runtime 状态 | `AvailabilitySnapshot` | 只取摘要，不拉全量 schema | 提前排除不可用能力 | 可替换为 provider-native namespace 列表 |
| 1. Build Discovery Catalog | 生成 discovery cards；builtin 以工具级，external MCP 先以 server 级为主 | `AvailabilitySnapshot` | `DiscoveryCatalog` | 每个 entry 控制为短描述，不带 schema | 让模型先做“方向选择”而不是“字段推理” | 可替换为 native tool_search / list_tools summary |
| 2. Deterministic Prefilter | 用规则排除 workflow、escape-hatch、高风险无关工具；必要时保留上轮 scope | 用户 turn、历史、catalog | `PrefilteredCatalog` | 进一步缩小候选集合 | 把明显不该竞争的工具先排掉 | 长期保留，不依赖 provider |
| 3. Discovery Selection Pass | 让模型只基于 discovery 信息输出候选 family / server / tool id 或 `no-tool` / `workflow` | `PrefilteredCatalog`、用户 turn | `CandidateScope` | 选择输出是短 JSON，而不是函数调用 schema | 工具选择从 20+ 或动态 N 个工具降为 3 到 8 个候选 | 未来可直接换成 tool_search / allowed tools 选择 |
| 4. Optional Discovery Expansion | 如果选择了某个 MCP server 或高复杂 family，再只展开该局部的 tool-level discovery | `CandidateScope`、局部 runtime 数据 | `RefinedCandidateScope` | 只展开选中的局部，而不是全量外部工具 | 外部 MCP 不再平铺进全局名字空间 | 未来可映射为 namespace 展开 |
| 5. Load Executable Schemas | 用 candidate scope 调用 scoped resolver，只为候选工具编译 `ToolDefinition[]` | `RefinedCandidateScope` | `ExecutableToolSet` | schema 总量按候选数线性下降 | 候选越少，最终工具调用越稳定 | 未来可换成 native deferred schema loading |
| 6. Formal Tool Call Pass | 模型只面对候选工具正式调用 | 消息、`ExecutableToolSet` | tool call | 只有候选工具 schema 进入请求 | 模型不再被大量无关工具干扰 | 未来可由 provider-native tools 替代 |
| 7. Runtime Argument Completion | 系统补全隐藏参数、别名、默认值和上下文值 | tool call、runtime policy、session env | `CompletedToolCall` | 不把环境参数暴露给模型 | 缩小模型可见参数面 | 长期保留 |
| 8. Validation + Repair Hint | 校验参数，必要时产出结构化修复提示 | `CompletedToolCall`、validation contract | `ValidatedToolCall` 或错误 | 减少靠 description 解释字段的开销 | 让失败回退有结构而不是纯文本 | 长期保留 |
| 9. Execute + Scoped Refresh | 由现有执行器执行；后续 `getTools` 只刷新当前 candidate scope | `ValidatedToolCall`、`ExecutableToolSet` | `ToolCallResult` | 不再按轮刷新全量工具 | 把 loop 内动态变化限制在候选域内 | 未来可换成 native deferred refresh |

### 6.3 两阶段流程的关键细节

#### A. discovery catalog 的粒度

builtin：

1. 以工具级 discovery 暴露。
2. 对高复杂工具可只暴露 wrapper 级 discovery 条目，不暴露旧多模式工具的原始面。

external MCP：

1. 默认先暴露 server 级 discovery，而不是把该 server 下所有工具平铺给模型。
2. 只有在阶段 A 选中某个 server 后，才展开该 server 的局部 tool-level discovery。

设计决策原因：外部 MCP 数量和 schema 面由用户运行时配置决定，不能继续让 discovery 成本和
用户配置规模强耦合。

#### B. CandidateScope 的限制

建议默认限制：

1. 原子工具候选最多 6 个。
2. 外部 MCP server 最多 2 个。
3. workflow 候选同时最多 1 个。
4. 若命中 `escape-hatch`，必须有显式用户意图或 feature flag。

设计决策原因：稳定性来自“足够小的候选集合”，不是来自更聪明的长提示词。

#### C. scope cache

建议给每个 session 维护一个短生命周期 `CandidateScopeCache`：

1. 用户仍在同一子任务下时，可复用上轮候选集合，避免重复 discovery 选择轮次。
2. 以下情况应主动失效：用户意图明显切换、candidate tool 连续失败、MCP server 状态变化、
   用户明确要求改用其他能力。

设计决策原因：两阶段流程会带来额外一轮模型交互，scope cache 是降低延迟的首要补偿手段。

#### D. 当前代码中的落点

建议按下述方式接到现有代码：

1. 在 [src/core/chat/services/chat-generation-for-model.ts](../src/core/chat/services/chat-generation-for-model.ts)
   中，把“直接 resolve 全量工具并注入 providerOptions.tools”改为：
   `buildDiscoveryCatalog -> resolveCandidateScope -> resolveToolRuntime(scope)`。
2. 继续复用 [src/core/chat/services/chat-tool-runtime-resolver.ts](../src/core/chat/services/chat-tool-runtime-resolver.ts)
   的 `explicitToolNames` / `explicitMcpServerIds` 作为阶段 B 的实际过滤器。
3. 给 provider 注入 `tools` 的同时，也注入 scope-aware `getTools`，确保 loop 内刷新仍只在
   当前 candidate scope 中进行。
4. 给 MCP runtime 增加 scope-aware 查询能力，避免阶段 A 或阶段 B 为无关 server 懒启动。

### 6.4 参数构造稳定性的具体做法

1. `Executable Schema Layer` 只暴露模型真正需要填写的字段。
2. 像 `serverId`、默认 timezone、默认 `response_format`、固定 `view` / `mode` 这类环境已知值，
   放进 Runtime Argument Completion Layer。
3. 当前 `toolHints.ts` 中的 alias、coercion、conditional rules 收口为统一 policy。
4. 验证失败时优先返回结构化 repair hint，而不是继续在 description 里堆文案。

设计决策原因：参数稳定性不能继续主要依赖 prompt，而要依赖“更小的 schema + 更强的系统补全”。

### 6.5 以后可以直接替换成原生能力的步骤

下列步骤是未来可直接替换的：

1. 步骤 1 到 4，可由 provider-native namespace / tool_search 接管一部分或全部。
2. 步骤 5，可由 native deferred loading 或 `allowed_tools` 接管。
3. 步骤 9 中的 scoped refresh，可由 provider-native lazy refresh 接管。

不应替换的部分：

1. Runtime Argument Completion Layer。
2. Validation Layer。
3. Execution Layer 的后端执行语义。

## 7. 原生 namespace + deferred loading 升级兼容方案

### 7.1 现在就应该抽象出来的接口

建议现在就建立以下接口，不要把业务逻辑写死在 provider 适配层：

```ts
interface ToolDiscoveryProvider {
  listDiscovery(snapshot: AvailabilitySnapshot): Promise<DiscoveryCatalog>
}

interface CandidateResolver {
  resolve(params: CandidateResolutionInput): Promise<CandidateScope>
}

interface ExecutableSchemaResolver {
  resolve(scope: CandidateScope): Promise<ExecutableToolSet>
}

interface ProviderToolSurfaceAdapter {
  buildDiscoveryPayload(...): Promise<ProviderDiscoveryPayload>
  buildExecutablePayload(...): Promise<ProviderExecutablePayload>
}
```

设计决策原因：如果这些职责直接写进 provider 适配器，未来切 native 能力时只能整体重写。

### 7.2 必须避免和当前栈耦死的点

1. 不要把 `ToolDefinition.name` 当稳定身份。
2. 不要让 provider 适配器直接知道 builtin registry 或 MCP runtime 的内部结构。
3. 不要再把长 description 当路由规则数据库。
4. 不要让 discovery metadata 带 provider 专有字段。
5. 不要把 workflow 工具继续当普通工具平铺给所有 provider。

### 7.3 升级时哪些模块保留，哪些替换

保留不动：

1. Tool Identity 与 tool metadata registry。
2. Candidate Resolution Layer。
3. Runtime Argument Completion Layer。
4. Validation Layer。
5. Execution Layer。

主要替换：

1. `ProviderToolSurfaceAdapter` 的实现。
2. Discovery payload 的输出方式。
3. Executable schema 注入方式。

部分替换：

1. MCP discovery 获取方式。
2. provider `getTools` 的刷新策略。

设计决策原因：未来 provider-native 能力变化最大的是“如何暴露给模型”，不是“如何在本地执行”。

### 7.4 避免“临时兼容让后续更难”的规则

1. 任何 wrapper 或 alias 都必须记录在 compatibility metadata 中。
2. 新增的 stableId 一旦对外使用，不再跟随 flat name 变动。
3. 第一阶段即恢复 family / namespace 概念，即使 provider 侧仍是 flat name。
4. discovery catalog 与 executable schema 的生成器必须分离，不能共享一个大 description 生产器。

### 7.5 provider capability matrix

建议单独维护一份 capability matrix，而不是在代码里散落 `if vendor === ...`：

| 能力 | 当前业务层状态 | 未来适配方式 |
| --- | --- | --- |
| namespace-aware discovery | 未接线 | 由 adapter 判断 provider 是否支持 |
| deferred schema loading | loop 层有 `getTools` 基础，但语义仍是全量刷新 | 升级为 scope-aware / native lazy load |
| allowed tools | SDK 层有迹象，业务层未接线 | 由 adapter 封装 |
| tool_search | 未接线 | 未来替换 discovery selection 的部分逻辑 |

## 8. skill 使用边界

### 8.1 skill 应该做什么

skill / workflow 只处理以下场景：

1. 复杂多步流程。
2. 需要规划和跟踪计划状态的任务。
3. 需要跨多类原子工具组合执行的任务。
4. 需要调度 sub-agent 或读入外部 skill 文档的任务。

### 8.2 skill 不应该做什么

1. 不给每个原子工具包一层 skill。
2. 不把 `Skill` 当成默认 discovery surface 的普通工具。
3. 不让 `sub_agent_*` 继续一 agent 一工具地平铺进默认聊天。
4. 不让 `write_plan` 出现在普通原子工具候选里。

### 8.3 workflow 模式的建议入口

建议把 workflow 视为一个独立的模式决定，而不是普通工具竞争结果：

1. Candidate Resolution Layer 可输出 `mode=workflow`。
2. 一旦进入 workflow 模式，系统再加载 workflow 专用 discovery 和执行面。
3. 普通原子工具阶段不再与 workflow 工具同池竞争。

设计决策原因：原子动作和复杂流程的路由准则完全不同，强行同池只会让双方都变差。

## 9. 风险控制、Feature Flag 与回滚策略

### 9.1 最大风险点

1. 两阶段流程会增加一次候选选择轮次，带来延迟上升风险。
2. Candidate Resolution 如果过度收窄，可能把正确工具排除在外。
3. MCP scoped resolve 如果实现不当，可能导致 server 未启动或工具不可见。
4. wrapper 拆分若和旧工具行为不完全一致，可能引入隐性回归。

### 9.2 兼容性风险

1. 当前 provider 仍以 flat function name 工作，stableId 与 providerCallName 的映射若不清晰，
   会出现“选中了 stableId，但执行时找不到旧名字”的兼容问题。
2. builtin 旧 server id 与统一 `BUILTIN_SERVER_ID` 并存，compat metadata 必须持续维护。
3. OpenRouter 仍走 OpenAI-compatible loop，不能因为升级设计就假设它已经 native 支持。

### 9.3 行为回归风险

1. `run_script`、`Skill`、`sub_agent_*` 被移出默认 discovery 后，某些过去依赖这些兜底能力的复杂任务可能短期退化。
2. `list_directory`、`get_time`、`fetch` 若只在 discovery 层做 wrapper，而 policy 没有补齐固定参数，可能出现旧模式漏传。

### 9.4 工具误选风险

1. 如果 discovery metadata 写得过短且缺少排除条件，`find_paths`、`search_file_content`、`query_vault_index`
   仍会互相争抢。
2. 如果 workflow 与原子工具没有彻底分面，误选风险仍然存在。

### 9.5 参数错误风险

1. 如果仍把 `response_format`、`mode`、`view` 这类高级旋钮暴露给模型，构参稳定性收益会被明显削弱。
2. 如果 Runtime Argument Completion Layer 只是简单透传现有 `toolHints`，而不真正收口规则，长期仍会退化回“靠文案补偿”。

### 9.6 推荐的 feature flag

| Flag | 作用 | 默认建议 |
| --- | --- | --- |
| `aiRuntime.toolDiscoveryCatalogV2` | 启用新的 discovery metadata 构建 | 先 shadow mode |
| `aiRuntime.twoStageToolSelection` | 启用 discovery -> candidate -> executable 两阶段主链 | 灰度开启 |
| `aiRuntime.scopedMcpResolve` | MCP runtime 仅按 scope 查询 / 连接 | 先对 builtin + 单 server 场景开启 |
| `aiRuntime.workflowToolsDefaultHidden` | 默认隐藏 workflow / escape-hatch 工具 | 应默认开启 |
| `aiRuntime.runtimeArgCompletionV2` | 启用统一参数补全与校验 | 灰度开启 |
| `aiRuntime.nativeDeferredAdapter` | 切换到 provider-native adapter | 默认关闭，未来实验 |

### 9.7 渐进式发布建议

建议分四步：

1. Shadow mode：先构建 discovery catalog 与 candidate scope，但不影响实际工具注入，只记录差异。
2. Builtin first：先对 builtin 与 workflow 隐藏策略生效，MCP 仍保守处理。
3. Scoped MCP：确认 server 级 discovery 正常后，再启用 scoped MCP resolve。
4. Wrapper split：最后再让 `get_time`、`list_directory`、`fetch` 的新 wrapper 正式进入默认 discovery。

### 9.8 回滚策略

1. `aiRuntime.twoStageToolSelection` 一键关闭后，立即回退到当前全量 `resolveToolRuntime()` 注入路径。
2. `aiRuntime.scopedMcpResolve` 关闭后，回退到当前 `getToolsForModelContext()` 行为。
3. wrapper discovery 若有问题，先隐藏 wrapper，继续调用旧工具名，不影响底层实现。

设计决策原因：回滚必须恢复当前已验证过的执行链路，而不是再走一套新的兼容分支。

## 10. 推荐实施顺序

### 10.1 推荐实施顺序

1. 定义 `ToolIdentity`、discovery metadata、runtime policy、compat metadata 的数据结构。
2. 为 builtin 工具补 discovery metadata sidecar，并恢复 logical family。
3. 给 MCP runtime 增加 scope-aware discovery / executable resolve 接口，但保留旧接口。
4. 在聊天主链引入 Candidate Resolution Layer，先跑 shadow mode。
5. 让 [src/core/chat/services/chat-tool-runtime-resolver.ts](../src/core/chat/services/chat-tool-runtime-resolver.ts)
   接受 candidate scope，并向 provider 同时注入 `tools` 与 scope-aware `getTools`。
6. 收口 `toolHints.ts`、MCP 参数修复和 builtin parse 前默认值，形成 Runtime Argument Completion Layer。
7. 最后才推进 wrapper split、discovery label 改名和 workflow 默认隐藏的正式切换。

### 10.2 最小可行改造集

第一阶段只改以下内容，就能带来明显收益：

1. 新增 discovery metadata 层，但 builtin 与 MCP 执行器保持不动。
2. 顶层聊天主链改成“discovery 粗选择 -> candidate scope -> filtered resolveToolRuntime”。
3. 复用现有 `explicitToolNames` / `explicitMcpServerIds`，不重写 resolver 主体。
4. MCP runtime 新增 scoped 查询接口，避免 discovery 阶段连接所有启用 server。
5. 默认把 `run_script`、`run_shell`、`Skill`、`sub_agent_*`、`write_plan` 移出原子工具默认 discovery。
6. 用统一 Runtime Argument Completion Layer 收口当前 `toolHints.ts` 的 alias / coercion / conditional rules。

这一组改造的价值最大，因为它直接打到当前三个根因：

1. schema 暴露过大。
2. 候选集合过大。
3. 参数构造过度依赖模型自己记住复杂规则。

### 10.3 第一阶段明确不做的事

1. 不重写底层 builtin 工具实现。
2. 不一次性真正拆掉旧多模式工具，只先做 wrapper 和 policy 固定。
3. 不强依赖 provider-native namespace 或 SDK beta 特性。
4. 不把所有 workflow 系统改造成新的 agent 框架。

设计决策原因：第一阶段必须先把收益集中在“更少暴露、更多过滤、统一补全”，否则改动面会远大于收益。
