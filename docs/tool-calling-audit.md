# Tool Calling Audit

本报告只审计当前仓库中的真实实现，不直接修改业务逻辑。

审计范围覆盖聊天主链、provider 适配层、工具注册层、MCP 运行时、skill/sub-agent。

未确认项：用户本地实际启用了多少外部 MCP server、暴露了多少外部工具、安装了多少
sub-agent 与 skill；这些数量依赖运行时配置，不完全存在于仓库源码中。

结论先行：当前实现本质上是“业务层统一聚合工具，然后把完整 description + schema
全量注入模型，再由本地自建 loop 执行工具”。它不是“原生 namespace + deferred
loading / tool_search” 架构，只是已经具备少量可复用的过渡原语。

## 1. 当前实现全景图

主链如下：

```text
用户消息
  -> generateAssistantResponseForModelImpl()
  -> ChatToolRuntimeResolver.resolveToolRuntime()
  -> requestTools = builtin + external MCP + sub_agent_*
  -> buildProviderMessagesForAgent()
  -> estimateToolDefinitionTokens(requestTools)
  -> providerOptions.tools = requestTools
  -> OpenAI-compatible / Claude loop
  -> 模型返回 tool call
  -> CompositeToolExecutor
```

关键事实：

- 主入口：`src/core/chat/services/chat-generation-for-model.ts` 的
  `generateAssistantResponseForModelImpl()`。
- 工具聚合入口：`src/core/chat/services/chat-tool-runtime-resolver.ts` 的
  `resolveToolRuntime()`。
- provider 真正发给模型的工具格式，只保留 `name`、`description`、`parameters` 或
  `input_schema`；见 `toOpenAITools()` 与 `toClaudeTools()`。
- builtin 已统一到 `src/tools/runtime/constants.ts` 的 `BUILTIN_SERVER_ID`，builtin
  内部原有家族边界在模型侧消失。
- 顶层聊天默认会把 sub-agent 一并放进工具面。

固定 builtin 数量目前为 22 个：

- `run_script` `run_shell` `write_plan` `get_time` `get_first_link_path`
- `read_file` `read_media` `read_files` `write_file` `edit_file`
- `create_directory` `list_directory` `move_path` `find_paths` `delete_path`
- `search_content` `query_index` `stat_path` `open_file`
- `fetch` `bing_search` `Skill`

## 2. API 栈与能力边界检查结果

当前仓库真实使用的调用栈：

- OpenAI 兼容 provider：`openAI.ts`、`azure.ts`、`qwen.ts`、`deepSeek.ts`、
  `kimi.ts`、`zhipu.ts`、`gemini.ts`、`grok.ts`、`siliconflow.ts`、
  `qianFan.ts`、`openRouter.ts` 基本都经 `withToolCallLoopSupport()` 接入统一 loop。
- 统一 loop 的核心执行文件是 `src/core/agents/loop/openAILoopRunner.ts`，真正发请求时
  调用的是 `client.chat.completions.create(...)`。
- Claude 走 `src/LLMProviders/claude.ts` +
  `src/core/agents/loop/ClaudeLoopHandler.ts`，使用的是
  `client.messages.create(...) + 本地 loop`。
- OpenRouter 的工具调用不是走 SDK 原生动态工具链，而是由 `openRouter.ts` 用
  `withToolCallLoopSupport()` 包装，在 loop 内创建 OpenAI client 指向 OpenRouter
  endpoint；`openRouterRequest.ts` 还会显式剔除 `tools`、`getTools`、
  `toolExecutor` 等内部参数。
- MCP 层使用的是“本地先连 server，再转成通用 ToolDefinition，再由本地执行器回调”
  的模式，不是把 MCP server 描述原样交给模型 API。

依赖版本见 `package.json`：

- `openai`: `^5.0.1`
- `@anthropic-ai/sdk`: `^0.56.0`
- `@openrouter/sdk`: `^0.9.11`
- `@modelcontextprotocol/sdk`: `^1.27.1`

已安装 SDK 类型可见但仓库未接线的能力：

- OpenAI：`Tool.Mcp`、`allowed_tools`、`ToolChoiceAllowed`、`mcp_list_tools`、
  `server_label`；证据在
  `node_modules/openai/src/resources/responses/responses.ts` 与
  `node_modules/openai/src/resources/chat/completions/completions.ts`。
- Anthropic beta：`allowed_tools`、`BetaRequestMCPServerURLDefinition`、
  `tool_configuration`、`mcp_servers`；证据在
  `node_modules/@anthropic-ai/sdk/src/resources/beta/messages/messages.ts`。
- OpenRouter SDK：`FieldOrAsyncFunction<T>`、`CallModelInput`、`callModel(...)`；
  证据在 `node_modules/@openrouter/sdk/esm/lib/async-params.d.ts` 与
  `node_modules/@openrouter/sdk/esm/funcs/call-model.d.ts`。

判断：当前业务层的真实边界仍是“自建 ToolDefinition + 自建 tool loop + 全量
schema 注入”，不是 native MCP / allowed_tools / deferred loading。

## 3. 当前工具注册与 schema 注入方式

builtin 定义方式：

- `BuiltinToolsRuntime.ts` 汇总注册 builtin。
- `register-tool.ts` / `tool-registry.ts` 负责把 Zod schema 注册为工具。
- `BuiltinToolRegistry.listTools()` 会执行
  `zodToJsonSchema(..., { target: 'openApi3', $refStrategy: 'none' })`。
- 这意味着模型看到的是展开后的 OpenAPI3 风格 JSON Schema，复杂结构倾向于内联。

聊天主链注入方式：

- `ChatToolRuntimeResolver.resolveToolRuntime()` 聚合 builtin、external MCP、sub-agent。
- 它已经支持 `explicitToolNames` 与 `explicitMcpServerIds`，但顶层聊天默认不用。
- 真正大量使用这两个筛选器的，是 `SubAgentToolExecutor`，不是主聊天链路。

注入请求时机：

- `generateAssistantResponseForModelImpl()` 直接设置
  `providerOptions.tools = toolRuntime.requestTools`。
- 顶层聊天主链没有设置 `providerOptions.getTools`，只注入静态 `tools`。

token 预算耦合：

- `src/core/chat/utils/token.ts` 的 `estimateToolDefinitionTokens()` 会把 `name`、
  `description`、`input_schema` 全量估算。
- `buildProviderMessagesForAgent()` 在上下文压缩前就把 tool token 纳入预算。
- 结果是工具越多，历史消息越早被压缩。

已有补偿层，但都不是两阶段加载：

- `toolHints.ts`：参数别名、coercion、条件规则、fallback tool。
- `mcpToolCallHandler.ts`：归一化、校验、失败追踪、恢复提示。
- `toolDescriptionSummary.ts`：仅供 UI 使用的短描述，不减少模型请求里的 schema 体积。

## 4. 工具边界问题矩阵

高风险边界问题：

- `run_script`：流程型万能工具，语义面等于“可编排所有其他工具”。
- `run_shell`：OS escape hatch，不应和普通业务工具同权竞争。
- `write_plan`：操作的是对话内部状态，不是外部世界对象。
- `get_time`：`current` / `convert` / `range` 三种任务塞进一个工具。
- `list_directory`：`flat` / `tree` / `vault` 三种视图混在同一工具。
- `find_paths` / `search_content` / `query_index`：分别按路径、正文、结构化索引发现，
  但用户意图常相近，只能靠描述里的路由规则维持稳定性。
- `fetch`：单 URL、批量 URL、raw、正文提取、分页都混在一起。
- `Skill`：工作流加载器，不是普通领域动作工具。
- `sub_agent_*`：递归式编排工具，本质是“再开一个代理来做事”。
- external MCP tools：数量与 schema 全由运行时配置决定，却被平铺进同一命名空间。

边界相对清晰、不建议优先拆分的工具：

- `get_first_link_path` `read_media` `write_file` `create_directory`
- `move_path` `stat_path` `open_file`

## 5. 参数面问题矩阵

记法：顶层字段 = schema 第一层字段数量；评级评的是“构参难度 + 误用概率”。

- `run_script`：1；深度 1；高。字段少，但真实参数面是一整段程序。
- `run_shell`：2；深度 1；高。字段少，但 open-world。
- `write_plan`：3；深度 3；中高。`tasks[]` 内含结构化子对象。
- `get_time`：6；深度 1；高。问题在模式互斥。
- `get_first_link_path`：1；深度 1；低。
- `read_file`：5；深度 1；中高。`read_mode` 驱动条件字段。
- `read_media`：1；深度 1；低。
- `read_files`：5；深度 1；中高。批量语义与模式语义叠加。
- `write_file`：2；深度 1；低。
- `edit_file`：3；深度 3；中。`edits[]` 是数组对象结构。
- `create_directory`：1；深度 1；低。
- `list_directory`：12；深度 1；极高。三种 `view` 共用一个 schema。
- `move_path`：2；深度 1；低。
- `find_paths`：6；深度 1；中。
- `delete_path`：2；深度 1；中。构参不难，但误删风险高。
- `search_content`：8；深度 1；高。模式、范围、过滤、上下文都在第一层。
- `query_index`：7；深度 4；极高。它更像一个小 DSL。
- `stat_path`：2；深度 1；低。
- `open_file`：2；深度 1；低。
- `fetch`：5；深度 1；高。单条、批量、raw、分页四层语义混在一起。
- `bing_search`：3；深度 1；中低。
- `Skill`：2；深度 1；高。参数简单，但会引入额外 prompt 载荷。
- `sub_agent_*`：1；深度 1；高。字段简单，但语义是触发另一个代理系统。
- external MCP tools：未确认；未确认；高。动态来源且无模型侧 namespace 限流。

跨工具共性问题：

- `response_format` 在多个文件工具中重复出现，放大了第一层字段面。
- 多个工具依赖模式字段控制互斥参数。
- `toolHints` 中存在大量别名与兼容修正，说明模型经常构造出“接近正确但不完全
  正确”的参数。

## 6. discovery surface 过大问题清单

根因是多层叠加，而不是单一问题：

- 默认全量注入：顶层聊天直接把 `requestTools` 全量注入 provider。
- 固定 builtin 已有 22 个，还不算 external MCP 与 `sub_agent_*`。
- description 太长：大量工具把“什么时候用/不用、参数规则、返回值、失败恢复、示例”
  全部塞进模型可见描述。
- 字段 description 也很长：Zod `describe(...)` 最终进入 JSON Schema。
- JSON Schema 不做引用复用：`$refStrategy: 'none'` 倾向于内联展开。
- 文件系统路由提示被重复拼接：系统依赖长提示词维持选择稳定性。
- 这里还有命名漂移：`BUILTIN_FILESYSTEM_TOOL_NAMES` 里写的是 `get_file_info`，实际
  注册名却是 `stat_path`；这条 routing hint 因而不会加到 `stat_path` 上。
- `Skill` 会额外触发 `<skills>` system prompt 注入。
- sub-agent 采用“一 agent 一工具”平铺暴露。
- `McpRuntimeManagerImpl.getAvailableToolsWithLazyStart()` 会尝试连接所有 enabled
  server。
- tool token 直接参与上下文压缩。

所以当前问题不是“描述写得不够聪明”，而是 discovery 阶段暴露了太多本不该一起
出现的内容。

## 7. 是否支持原生 namespace + deferred loading 的判断

namespace：不支持。

- `ToolDefinition` 虽有 `source` 与 `sourceId`，见
  `src/core/agents/loop/types.ts`。
- 但 `toOpenAITools()` 与 `toClaudeTools()` 不会把它们发给模型。
- 模型看到的是扁平全局函数名空间，不是按 server 或家族分层的 namespace。

deferred loading：不支持。

- provider 抽象里有 `getTools?: GetToolsFn`，OpenAI loop 与 Claude loop 也支持按轮
  `resolveCurrentTools(tools, getTools)`。
- 但顶层聊天主链没有设置 `providerOptions.getTools`。
- 即便以后设置，它也只是“重新拿一份完整 ToolDefinition[]”，不是“先给 summary，
  选中后再拉详细 schema”。

tool_search：不支持。

- 仓库源码中未检出 `tool_search` 的实现或接线。

原生 MCP / allowed_tools：SDK 层有迹象，仓库业务层未接入，置信度高。

## 8. 若不支持，模拟两阶段流程的可行插入点

当前代码并非完全没有复用基础，最合适的插入点有四个：

- `generateAssistantResponseForModelImpl()`：当前是“拿完整工具集后直接发请求”；
  未来可改成“先 discovery，再按候选集合解析工具”。
- `ChatToolRuntimeResolver.resolveToolRuntime()`：这里已经有
  `explicitToolNames` / `explicitMcpServerIds`，是当前最值得复用的候选子集
  primitive。
- provider 的 `getTools`：OpenAI loop 和 Claude loop 已支持按轮动态取工具；未来可把
  它绑定为“候选集合的最新版本”，把 full set refresh 收缩为 candidate refresh。
- `McpRuntimeManagerImpl.getToolsForModelContext()`：未来需要 scoped 查询接口，
  例如 `getToolsForModelContext({ serverIds?, toolNames? })`，否则上层缩了候选集，
  运行时仍会把全部 enabled server 连起来。

推荐的模拟两阶段流程：

```text
阶段 A：构建轻量 catalog（短描述、类别、serverId、风险标签、参数摘要）
阶段 B：做候选选择（输出 explicitToolNames / explicitMcpServerIds）
阶段 C：resolveToolRuntime({ explicitToolNames, explicitMcpServerIds })
阶段 D：providerOptions.tools = candidateTools；providerOptions.getTools = refreshedCandidateTools
```

这个方案的好处是：最大限度复用现有 resolver、loop 与执行器，不必先推翻
builtin/MCP/sub-agent 结构，也更利于未来迁移到原生 namespace / allowed_tools。

## 9. 未来升级兼容性风险点

- 扁平名称空间风险：provider 只认 `tool.name`，未来切 native namespace 时必须
  扩展 `ToolDefinition` 到 provider payload 的映射。
- provider 特定名称改写风险：`openRouter.ts` 会对工具名规范化与去重，这对 today 的
  扁平 function name 有效，但不天然兼容 future namespace。
- metadata 丢失风险：`title`、`annotations`、`source`、`sourceId` 都不是模型可见
  字段，原生 readOnly/destructive/approval 等能力没有接线空间。
- builtin 家族边界被提前抹平：当前 builtin 已统一到 `BUILTIN_SERVER_ID`。
- 同名冲突风险：resolver 会保留 builtin、跳过同名外部 MCP 工具。
- discovery 规则依赖长 description：一旦未来切短描述或换原生 MCP 描述符，这些
  隐式规则会一起失效。
- 参数兼容修正层风险：`toolHints` 说明外部 prompt 习惯和 schema 现实已有漂移。
- 上下文压缩联动风险：工具 surface 改变后，聊天历史保留行为也会变化。
- orchestration 工具误迁移风险：`run_script`、`Skill`、`sub_agent_*` 不应和普通
  数据工具一视同仁地迁移到 native MCP surface。
- provider 行为分叉风险：OpenAI/OpenRouter/Azure/Claude 当前工具链表面统一，
  底层并不统一。

## 10. 建议的拆分优先级（P0 / P1 / P2）

P0：

- 建立“模型可见的短 catalog”和“执行用完整 schema”两套表示。
- 在顶层聊天主链复用 `explicitToolNames` / `explicitMcpServerIds`。
- 把默认 discovery 面中的编排工具降权或移出默认面；首批关注 `run_script`、
  `run_shell`、`Skill`、`sub_agent_*`。
- 给 MCP 运行时补 scoped tool resolve 能力。
- 分离“人类帮助文档”和“模型工具描述”。

P1：

- 优先拆 `list_directory`，至少把 `vault` 总览从普通目录浏览中拆出。
- 优先拆 `get_time` 的 `current` / `convert` / `range`。
- 优先拆 `fetch` 的单 URL 与批量语义。
- 降低 `query_index` 的直接暴露面；它更像 query DSL，不像普通工具。
- 评估是否去掉大批只为模型提供可读文本的 `response_format` 分支。

P2：

- 扩展 `ToolDefinition` 的模型侧抽象，显式建模 namespace/server/approval/risk
  元信息。
- 为 provider 建 capability matrix，区分原生 tool loop、allowed_tools、MCP
  server descriptors、deferred loading。
- 为 OpenAI / Anthropic / OpenRouter 分别准备 native adapter 层。

## 结尾判断

现在最需要先改什么：

- 先改 discovery 链路，而不是先拆每一个业务工具。
- 更具体地说，先把“全量工具直接注入”改成“轻量发现 -> 候选子集 -> 正式调用”。

什么暂时不要改：

- 不要先重写 builtin 工具执行器。
- 不要先推翻 `McpToolExecutor` 的失败恢复逻辑。
- 不要先做“一工具一 skill”或“一工具一 sub-agent”的表面包装。

哪些地方盲改风险最高：

- `query_index`：它已经是一个小 DSL，盲拆最容易破坏现有查询表达能力。
- `run_script`：它承担了现有系统的编排兜底角色，盲删或盲降权会暴露大量下游空洞。
- `ChatToolRuntimeResolver` 与 `McpRuntimeManagerImpl`：这两个点共同控制“工具集合
  是什么”和“为哪些 server 付出启动成本”。
- OpenRouter 工具调用链：当前是 SDK 请求链和 OpenAI-compatible tool loop 的混合体。
- provider 适配层整体：任何 native 能力切换都应按 provider 分层落地，而不是一次性
  全局替换。
