# Tool Calling Migration Plan

<!-- markdownlint-disable MD013 -->

状态：进行中（Phase A-G 最小可交付物已落地，Phase H 仍有收尾）  
日期：2026-04-01

本文档基于 [tool-calling-audit.md](tool-calling-audit.md) 与
[tool-calling-target-design.md](tool-calling-target-design.md)，目标是把当前“全量 schema 直接注入”
的工具调用链，渐进迁移到“discovery -> candidate scope -> executable schema”两阶段架构。

本计划只定义实施路径，不直接启动全量业务重构。

## 0. 当前 MVP 偏差说明

截至 2026-04-01，仓库中的首个可运行 MVP 先落了“确定性 candidate resolver”，
而不是再引入一次额外的模型 discovery selection pass。也就是说，当前链路已经具备：

1. discovery catalog
2. candidate scope
3. candidate executable schema 注入
4. scope-aware getTools

但阶段 C 的“候选选择”暂时由系统规则完成，而不是由模型在 discovery catalog 上再走一轮选择。

这样做的原因是：

1. 先最小化改动面，优先验证 schema 缩减、候选过滤和参数补全是否稳定。
2. 当前 provider 侧还没有原生 deferred loading，过早引入额外一轮模型交互会同时放大延迟与回归面。
3. 现有 `explicitToolNames` / `explicitMcpServerIds` 已足够支撑第一波收益最大的最小可行改造集。

后续如果要继续推进到目标设计中的“模型驱动 discovery selection pass”，应该替换的层只有
`CandidateScopeResolver`，不需要再改 `PreparedToolTurn`、`ProviderToolSurfaceAdapter`、
执行器或参数补全层。

## 0.1 当前 Phase E 落地状态

截至 2026-04-01，Phase E 的三组高复杂 wrapper surface 已全部落地：

1. `get_current_time`、`convert_time`、`calculate_time_range`
2. `list_directory_tree`、`list_vault_overview`
3. `fetch_webpage`、`fetch_webpages_batch`

当前代码事实是：

1. legacy `get_time`、`list_directory` 与 `fetch` 仍保留在 builtin runtime 中，兼容旧调用路径。
2. 当 `timeWrappersV1` / `vaultWrappersV1` / `fetchWrappersV1` 打开时，默认 atomic discovery 会优先暴露 wrapper；其中 `list_directory` 的默认 surface 会收窄为 flat 视图，`tree` / `vault` 面改由 wrapper 承担。
3. vault wrapper 已通过纯 surface/参数映射测试、候选选择测试与全量 `npm run test`、`npm run lint`、`npm run build` 验证。

这意味着当前仓库已经完成 Phase E 的最小可行拆分，后续待继续的是 Phase F 之后的 workflow 分面、native adapter seam 与收尾清理。

## 0.2 当前新增落地状态

截至 2026-04-01 当前轮实现，仓库又补上了四块关键缺口：

1. `workflowModeV1` 已真实接线，workflow resolver / catalog / policy 已独立落地；`run_shell`、`run_script`、`write_plan`、`Skill` 与 `sub_agent_*` 的显式 workflow 路由不再只依赖 `chat-tool-candidate-resolver.ts` 内的硬编码 matcher。
2. `runtimeArgCompletionV2` 已真实控制执行器行为：`BuiltinToolExecutor` 与 `McpToolExecutor` 会按开关决定是否执行统一 completion 层，关闭开关时回退为“不做 runtime completion，仅保留原始参数校验/legacy 容错”的路径。
3. `ProviderToolSurfaceAdapter` 已扩展为共享 discovery payload / executable payload 契约，并引入 capability matrix；current-loop adapter 与 native-deferred adapter 均已具备合同测试，`nativeDeferredAdapter` 仍默认关闭。
4. Phase D 的最小结构化收口已经完成：参数校验错误现在会产出统一 `errorContext`（issue + repair hints），并由 `ToolCallResult` / `ToolExecutionRecord` 透传；legacy `mcpToolCallHandler` 也已切到同一 formatter，避免 builtin / MCP / legacy 三套错误文案继续分叉。

当前剩余的重点不再是主链缺失，而是：

1. 扩展 curated regression corpus，并继续补 provider 级与真实会话级回归样本。
2. 完成真实 Obsidian 手工验证、观察期日志收口与过渡 flag 退场策略，把 Phase H 收尾做完。

当前仓库里已经补上的 Phase H 基线包括：

1. `src/core/chat/services/__fixtures__/tool-selection-regression.ts` 中的最小 curated prompt corpus。
2. `tool-call-validation.test.ts`、`tool-executor-runtime-flags.test.ts`、`tool-selection-regression.test.ts` 对结构化错误透传、runtime flag 与 wrapper/workflow 候选选择的固定回归断言。

## 1. 总体原则

1. 先改注入链路与抽象边界，再改工具内部实现。
2. 先做 shadow mode 与可回滚接线，再开启真实行为切换。
3. 每个阶段都必须保留当前执行器、provider loop 与 MCP 容错主链的稳定性。
4. 默认把复杂流程能力与原子工具分面，避免继续同池竞争。
5. 任何新增 stableId、wrapper、alias 都必须进入兼容层，不允许散落在 provider 或 description 中。

## 2. 阶段依赖图

| Phase | 主题 | 依赖 | 最小可交付物 | 默认发布方式 |
| --- | --- | --- | --- | --- |
| A | 接口抽象，不改行为 | 无 | pass-through 协调器 + 新类型层 | 直接合入 |
| B | discovery metadata / executable schema 分层 | A | 可构建 catalog，但不改变注入 | shadow mode |
| C | 候选筛选与二阶段注入 | B | candidate scope + scoped resolve | feature flag 灰度 |
| D | 运行时参数补全与严格校验 | C | 统一 completion / validation 管线 | feature flag 灰度 |
| E | 拆分大工具 / 清理边界 | B、D | wrapper discovery + legacy alias | 分工具灰度 |
| F | skill 边界与 workflow 分面 | C、D | workflow mode 与默认隐藏策略 | feature flag 灰度 |
| G | native namespace / deferred loading 适配层 | A、C | 当前栈 adapter + native adapter seam | 默认关闭 |
| H | 测试、回归、清理旧逻辑 | C、D、E、F、G | 回归基线、旧逻辑退场清单 | 最后收口 |

建议实施顺序：A -> B -> C -> D -> E -> F -> G -> H。  
如果人力紧张，第一波只做 A、B、C、D。

## 3. 兼容层边界

### 3.1 业务层只依赖的接口

建议让聊天主链只依赖以下抽象，而不是直接拼 provider tools：

```ts
interface ToolSelectionCoordinator {
  prepareTurn(input: ToolSelectionInput): Promise<PreparedToolTurn>
}

interface ToolDiscoveryCatalogProvider {
  buildCatalog(input: AvailabilitySnapshot): Promise<DiscoveryCatalog>
}

interface CandidateScopeResolver {
  resolve(input: CandidateResolutionInput): Promise<CandidateScope>
}

interface ExecutableToolSetResolver {
  resolve(scope: CandidateScope): Promise<ExecutableToolSet>
}

interface ToolCallPolicyResolver {
  resolve(toolIds: string[]): Promise<ToolCallPolicySet>
}

interface ProviderToolSurfaceAdapter {
  buildDiscoveryPayload(input: DiscoveryCatalog, scope: CandidateScope): Promise<unknown>
  buildExecutablePayload(input: ExecutableToolSet): Promise<unknown>
  supportsNativeDeferredLoading(): boolean
}
```

### 3.2 当前栈兼容层

| 边界 | 当前实现先依赖什么 |
| --- | --- |
| Discovery catalog | builtin metadata sidecar、[src/domains/mcp/runtime/runtime-manager.ts](../src/domains/mcp/runtime/runtime-manager.ts) 的 server 摘要、workflow visibility 规则 |
| Candidate scope | 新的 resolver，外加现有会话上下文与 scope cache |
| Executable tool set | [src/core/chat/services/chat-tool-runtime-resolver.ts](../src/core/chat/services/chat-tool-runtime-resolver.ts) 的 `explicitToolNames` / `explicitMcpServerIds` |
| 参数补全与校验 | [src/services/mcp/toolHints.ts](../src/services/mcp/toolHints.ts) + builtin schema parse + MCP 校验逻辑 |
| Provider 注入 | [src/core/chat/services/chat-generation-for-model.ts](../src/core/chat/services/chat-generation-for-model.ts) 向 [src/LLMProviders/provider-shared.ts](../src/LLMProviders/provider-shared.ts) 的 `tools` / `getTools` / `toolExecutor` 接线 |

### 3.3 未来 native 适配时只替换什么

1. 替换 `ProviderToolSurfaceAdapter` 的实现。
2. 按 provider capability matrix 决定 discovery payload 与 executable payload 是否走原生 namespace / allowed tools / deferred loading。
3. 必要时替换 ExecutableToolSetResolver 的最后一跳编译方式，但不改 CandidateScope、ToolCallPolicyResolver 与执行器。

### 3.4 如何让业务层无感知底层差异

业务层统一只消费 `PreparedToolTurn`：

```ts
interface PreparedToolTurn {
  readonly candidateScope: CandidateScope
  readonly executableToolSet: ExecutableToolSet
  readonly toolPolicies: ToolCallPolicySet
  readonly mode: 'no-tool' | 'atomic-tools' | 'workflow'
}
```

对业务层来说，不关心底层到底是：

1. 自建 discovery + scoped resolve。
2. provider 原生 deferred loading。
3. provider 原生 namespace + allowed tools。

它只需要知道：当前轮有哪些候选、哪些可执行工具、哪些参数由系统补全。

## 4. Phase A：只抽象接口，不改变行为

| 项目 | 说明 |
| --- | --- |
| 目标 | 建立稳定类型与协调器边界，让后续 phases 改内部实现即可，不再让聊天主链直接依赖“全量 resolve 后直接注入”。 |
| 本阶段不做什么 | 不改变任何工具可见性；不减少 schema；不引入 candidate scope；不改变 MCP 懒启动行为。 |
| 影响范围 | 聊天主链入口、tool runtime 返回类型、provider 注入边界。 |
| 修改文件范围 | [src/core/chat/services/chat-generation-for-model.ts](../src/core/chat/services/chat-generation-for-model.ts)、[src/core/chat/services/chat-tool-runtime-resolver.ts](../src/core/chat/services/chat-tool-runtime-resolver.ts)、[src/core/chat/services/chat-tool-runtime-resolver-types.ts](../src/core/chat/services/chat-tool-runtime-resolver-types.ts)、[src/core/agents/loop/types.ts](../src/core/agents/loop/types.ts)。 |
| 新增模块 / 类型 / 适配层 | 建议新增 `src/core/chat/services/chat-tool-selection-types.ts`、`src/core/chat/services/chat-tool-selection-coordinator.ts`、`src/core/chat/services/chat-tool-surface-adapter.ts`。Phase A 中 coordinator 只做 pass-through。 |
| 完成后相同点 | provider 仍收到完整 `requestTools`；`toolExecutor`、`maxToolCallLoops`、skill/sub-agent/MCP 的当前表现完全一致。 |
| 完成后差异点 | 顶层聊天从“直接 resolve”改为“走 coordinator，再落回原逻辑”；后续 phases 有统一替换点。 |
| 验证方式 | 单元测试确认 pass-through 输出与旧 `resolveToolRuntime()` 完全一致；集成测试确认 buildProviderMessages 与 tool 数量不变；手工验证聊天、MCP、Skill 不回归。 |
| 回滚策略 | 直接回滚 coordinator 接线，恢复 `chat-generation-for-model.ts` 内部旧路径；无需数据迁移。 |
| Feature flag | 不需要。若团队想更保守，可加内部开关 `aiRuntime.toolSurfaceAbstractionV1`，但默认常开。 |
| 与未来 native 升级关系 | 这是整个迁移的承重墙；未来只替换 adapter/resolver，不再改聊天主链接口。 |
| 是否单独提交 commit | 是，建议单独提交。 |
| 完成标准 | 1. 新增类型与 coordinator 后，工具注入结果与基线完全一致。 2. 不新增用户可见行为变化。 3. 所有现有相关测试保持通过。 |

## 5. Phase B：引入 discovery metadata 与 executable schema 分层

| 项目 | 说明 |
| --- | --- |
| 目标 | 让 discovery 信息、可执行 schema、运行时 policy、升级兼容 metadata 四层正式分离，但先不改变实际注入行为。 |
| 本阶段不做什么 | 不启用二阶段选择；不缩减真实注入集合；不拆工具实现；不让 provider 感知 namespace。 |
| 影响范围 | builtin metadata 组织方式、MCP discovery 摘要、catalog 构建与 shadow telemetry。 |
| 修改文件范围 | [src/tools/runtime/tool-registry.ts](../src/tools/runtime/tool-registry.ts)、[src/tools/runtime/BuiltinToolsRuntime.ts](../src/tools/runtime/BuiltinToolsRuntime.ts)、[src/domains/mcp/runtime/runtime-manager.ts](../src/domains/mcp/runtime/runtime-manager.ts)、[src/services/mcp/toolDescriptionSummary.ts](../src/services/mcp/toolDescriptionSummary.ts)、[src/core/chat/services/chat-generation-for-model.ts](../src/core/chat/services/chat-generation-for-model.ts)。 |
| 新增模块 / 类型 / 适配层 | 建议新增 `src/tools/runtime/tool-discovery-metadata.ts`、`src/core/chat/services/chat-tool-discovery-catalog.ts`、`src/core/chat/services/chat-tool-compat-metadata.ts`、`src/core/chat/services/chat-tool-runtime-policy-types.ts`。 |
| 完成后相同点 | 真正发给模型的仍是当前完整 `ToolDefinition[]`；执行器与 loop 不变。 |
| 完成后差异点 | 系统已能独立构建 `DiscoveryCatalog`；builtin、MCP、workflow、escape-hatch 都有清晰 visibility 与 family 信息；可以开始做 shadow 比对。 |
| 验证方式 | 单元测试覆盖 metadata 映射、family/stableId 生成、visibility 分类；集成测试确认 catalog 覆盖当前所有工具且与 `ToolDefinition.name` 映射完整；shadow mode 记录 catalog 大小与全量 schema token 差异。 |
| 回滚策略 | 关闭 `toolDiscoveryCatalogV2` 后恢复旧描述与旧日志路径；metadata sidecar 可保留但不接线。 |
| Feature flag | `aiRuntime.toolDiscoveryCatalogV2`，默认 shadow mode，不影响用户行为。 |
| 与未来 native 升级关系 | 这是 provider-native tool_search / namespace 展开的前置数据层；没有这一层就无从做 native 迁移。 |
| 是否单独提交 commit | 是，建议单独提交。 |
| 完成标准 | 1. `DiscoveryCatalog` 覆盖 100% 当前工具。 2. 每个工具都有 stableId、familyId、visibility。 3. 开关关闭时用户行为零变化。 |

## 6. Phase C：引入候选工具筛选与二阶段 schema 注入

| 项目 | 说明 |
| --- | --- |
| 目标 | 把顶层聊天从“全量工具直接注入”改为“discovery -> candidate scope -> scoped executable schema 注入”。 |
| 本阶段不做什么 | 不处理复杂参数补全；不拆大工具内部实现；不切 provider-native deferred loading。 |
| 影响范围 | 聊天主链、resolver、scope cache、provider `getTools`、MCP scoped resolve。 |
| 修改文件范围 | [src/core/chat/services/chat-generation-for-model.ts](../src/core/chat/services/chat-generation-for-model.ts)、[src/core/chat/services/chat-tool-runtime-resolver.ts](../src/core/chat/services/chat-tool-runtime-resolver.ts)、[src/LLMProviders/provider-shared.ts](../src/LLMProviders/provider-shared.ts)、[src/domains/mcp/runtime/runtime-manager.ts](../src/domains/mcp/runtime/runtime-manager.ts)、[src/core/agents/loop/types.ts](../src/core/agents/loop/types.ts)。 |
| 新增模块 / 类型 / 适配层 | 建议新增 `src/core/chat/services/chat-tool-candidate-resolver.ts`、`src/core/chat/services/chat-tool-scope-cache.ts`、`src/core/chat/services/chat-tool-selection-pipeline.ts`、`src/core/chat/services/chat-tool-get-tools-adapter.ts`。 |
| 完成后相同点 | 选中的工具仍由现有执行器执行；provider loop 仍走当前 `tools` / `getTools` 机制；MCP 与 builtin 的真实执行不变。 |
| 完成后差异点 | provider 默认只看到候选工具 schema；workflow / escape-hatch 默认不再与原子工具同池竞争；`getTools` 变为 scope-aware refresh。 |
| 验证方式 | 单元测试覆盖 prefilter、candidate scope、cache 失效与 `explicitToolNames` / `explicitMcpServerIds` 映射；集成测试覆盖 builtin-only、builtin+MCP、MCP server 失效、sub-agent 关闭；shadow 数据集比较 candidate recall 与 token 降幅。 |
| 回滚策略 | 关闭 `twoStageToolSelection` 与 `scopedMcpResolve`，恢复全量 `resolveToolRuntime()` 注入；保留 catalog 供后续继续调试。 |
| Feature flag | `aiRuntime.twoStageToolSelection`、`aiRuntime.scopedMcpResolve`。推荐先 shadow，再 builtin-first，再带 MCP。 |
| 与未来 native 升级关系 | 这是对 native deferred loading 的逻辑等价层；未来只需把“scoped executable payload”换成 provider 原生能力。 |
| 是否单独提交 commit | 是，必须单独提交。 |
| 完成标准 | 1. 基准提示集上 candidate recall 不低于 98%。 2. builtin-only 场景工具 schema token 至少下降 40%。 3. 开关关闭时能一键回退到旧路径。 |

## 7. Phase D：引入运行时参数补全与严格校验

| 项目 | 说明 |
| --- | --- |
| 目标 | 把 alias、coercion、默认值、上下文注入、互斥校验与 repair hint 从散落逻辑收口为统一 completion / validation 层。 |
| 本阶段不做什么 | 不新增新的万能工具；不在 description 中继续堆更多纠错说明；不重写执行器主体。 |
| 影响范围 | builtin 参数解析、MCP 参数校验、工具调用失败回退文本。 |
| 修改文件范围 | [src/services/mcp/toolHints.ts](../src/services/mcp/toolHints.ts)、[src/services/mcp/McpToolExecutor.ts](../src/services/mcp/McpToolExecutor.ts)、[src/tools/runtime/BuiltinToolExecutor.ts](../src/tools/runtime/BuiltinToolExecutor.ts)、`src/services/mcp` 下的校验/调用辅助文件、[src/core/agents/loop/types.ts](../src/core/agents/loop/types.ts)。 |
| 新增模块 / 类型 / 适配层 | 建议新增 `src/core/agents/loop/tool-call-argument-completion.ts`、`src/core/agents/loop/tool-call-validation.ts`、`src/core/chat/services/chat-tool-runtime-policy-registry.ts`、`src/core/chat/services/chat-tool-repair-hints.ts`。 |
| 完成后相同点 | 对已经正确构参的调用，结果与之前一致；底层真实工具函数不变。 |
| 完成后差异点 | 模型不再需要看见所有环境参数；系统能自动补全 `mode`、`view`、`response_format`、timezone 等已知值；失败返回结构化修复提示。 |
| 验证方式 | 单元测试覆盖 alias、整数/布尔 coercion、默认值注入、互斥字段报错、repair hint；集成测试覆盖 builtin 与 MCP 混合工具调用；回归测试覆盖旧 prompt 中的 legacy 参数名。 |
| 回滚策略 | 关闭 `runtimeArgCompletionV2`，恢复原 `toolHints` 与 executor 内部分散逻辑。 |
| Feature flag | `aiRuntime.runtimeArgCompletionV2`。 |
| 与未来 native 升级关系 | 这一层未来仍然保留；就算 provider 原生支持 deferred loading，也不能把参数稳定性重新交回给 prompt。 |
| 是否单独提交 commit | 是，建议单独提交。 |
| 完成标准 | 1. 旧别名样本的自动修复成功率达到 98% 以上。 2. 校验失败时 100% 返回结构化错误而不是静默失败。 3. 正确调用样本不出现行为回归。 |

## 8. Phase E：按需拆分过大的工具 / 清理工具边界

| 项目 | 说明 |
| --- | --- |
| 目标 | 优先在 discovery 与 executable schema 层拆分 `get_time`、`list_directory`、`fetch` 这类多模式工具，并清理误导性的工具标签。 |
| 本阶段不做什么 | 不一次性删除 legacy 工具名；不重写底层文件系统或抓取执行逻辑；不做大规模 provider 适配。 |
| 影响范围 | builtin 工具注册、wrapper 工具、路由提示、tool policy。 |
| 修改文件范围 | [src/tools/time/time-tools.ts](../src/tools/time/time-tools.ts)、[src/tools/vault/filesystemListDirHandlers.ts](../src/tools/vault/filesystemListDirHandlers.ts)、[src/tools/vault/filesystemToolDescriptions.ts](../src/tools/vault/filesystemToolDescriptions.ts)、[src/tools/web/fetch-tools.ts](../src/tools/web/fetch-tools.ts)、[src/services/mcp/toolHints.ts](../src/services/mcp/toolHints.ts)、[src/core/chat/services/chat-tool-runtime-resolver-support.ts](../src/core/chat/services/chat-tool-runtime-resolver-support.ts)。 |
| 新增模块 / 类型 / 适配层 | 建议新增 wrapper/sidecar：`src/tools/time/time-wrapper-tools.ts`、`src/tools/vault/filesystem-wrapper-tools.ts`、`src/tools/web/fetch-wrapper-tools.ts`；同时在兼容 metadata 中记录 legacyCallNames。 |
| 完成后相同点 | 旧工具名仍可被 compat 层调用；底层执行结果不变。 |
| 完成后差异点 | 默认 discovery surface 优先暴露窄边界 wrapper；旧多模式工具降为 candidate-only 或 hidden；`stat_path`、`query_index`、`search_content` 的 discovery label 更清晰。 |
| 验证方式 | 单元测试覆盖 wrapper 到 legacy call 的参数固定与 stableId 映射；集成测试覆盖时间转换、目录列表、网页抓取；对比新旧工具在同一 golden case 上结果一致。 |
| 回滚策略 | 隐藏 wrapper，恢复 legacy 工具进入默认 discovery；compat metadata 保留。 |
| Feature flag | 建议按工具族拆开，如 `aiRuntime.timeWrappersV1`、`aiRuntime.vaultWrappersV1`、`aiRuntime.fetchWrappersV1`。 |
| 与未来 native 升级关系 | 更小的工具边界与更小的 schema 是 native namespace 最需要的准备动作；否则即使换原生接口也仍然会携带“大而混杂的工具”。 |
| 是否单独提交 commit | 是，建议按工具族分别提交。 |
| 完成标准 | 1. wrapper 样本与 legacy 样本结果一致。 2. 旧工具名暂不移除。 3. 默认 discovery 中不再出现高复杂多模式 schema。 |

## 9. Phase F：引入 skill 边界（仅针对复杂流程）

| 项目 | 说明 |
| --- | --- |
| 目标 | 明确 workflow surface，只让 Skill、sub-agent、write_plan、run_script、run_shell 在复杂流程或显式意图下出现。 |
| 本阶段不做什么 | 不把每个原子工具包装成 skill；不把 workflow 工具重新合并成一个万能 action。 |
| 影响范围 | workflow 路由、skill/sub-agent 暴露策略、plan/shell/script 工具 visibility。 |
| 修改文件范围 | [src/tools/skill/skill-tools.ts](../src/tools/skill/skill-tools.ts)、[src/tools/sub-agents/subAgentTools.ts](../src/tools/sub-agents/subAgentTools.ts)、[src/tools/sub-agents/SubAgentToolExecutor.ts](../src/tools/sub-agents/SubAgentToolExecutor.ts)、[src/tools/plan/plan-tools.ts](../src/tools/plan/plan-tools.ts)、[src/tools/script/script-tools.ts](../src/tools/script/script-tools.ts)、[src/core/chat/services/chat-tool-runtime-resolver.ts](../src/core/chat/services/chat-tool-runtime-resolver.ts)、[src/domains/chat/service-plan-prompts.ts](../src/domains/chat/service-plan-prompts.ts)。 |
| 新增模块 / 类型 / 适配层 | 建议新增 `src/core/chat/services/chat-workflow-mode-resolver.ts`、`src/core/chat/services/chat-workflow-tool-catalog.ts`、`src/core/chat/services/chat-workflow-policy.ts`。 |
| 完成后相同点 | 显式请求 Skill、sub-agent、write_plan、run_script、run_shell 时，系统仍能提供这些能力。 |
| 完成后差异点 | 原子工具 discovery 默认不再暴露 workflow / escape-hatch；复杂任务由 `mode=workflow` 进入独立 surface；`run_shell` 只在显式意图下进入候选。 |
| 验证方式 | 单元测试覆盖 workflow mode 判定与 visibility 规则；集成测试覆盖显式“执行 shell”“调用 sub-agent”“读取 skill”场景；回归测试覆盖原子文件操作不再误选 workflow。 |
| 回滚策略 | 关闭 `workflowModeV1` 与 `workflowToolsDefaultHidden`，恢复当前同池暴露。 |
| Feature flag | `aiRuntime.workflowToolsDefaultHidden`、`aiRuntime.workflowModeV1`。 |
| 与未来 native 升级关系 | 未来可以直接把 workflow 映射到独立 namespace 或 allowed_tools 组；这一层决定的是路由边界，不依赖 SDK 成熟度。 |
| 是否单独提交 commit | 是，建议单独提交。 |
| 完成标准 | 1. 原子模式下 workflow 工具默认 surface 数量为 0。 2. 显式 workflow 请求仍然可达。 3. `run_shell` 不再被普通搜索/读取任务误选。 |

## 10. Phase G：为未来切换原生 namespace + deferred loading 做适配层

| 项目 | 说明 |
| --- | --- |
| 目标 | 把“当前自建两阶段”与“未来 provider-native deferred loading”统一到同一 adapter seam 后面。 |
| 本阶段不做什么 | 不立即切换到任一 SDK beta 能力；不一次性改所有 provider 行为。 |
| 影响范围 | provider capability matrix、tool surface adapter、可能的 provider-specific payload 适配。 |
| 修改文件范围 | [src/LLMProviders/provider-shared.ts](../src/LLMProviders/provider-shared.ts)、[src/core/chat/services/chat-generation-for-model.ts](../src/core/chat/services/chat-generation-for-model.ts)、`src/LLMProviders` 下实际接入工具调用循环的 provider 文件、[src/core/agents/loop/types.ts](../src/core/agents/loop/types.ts)。 |
| 新增模块 / 类型 / 适配层 | 建议新增 `src/core/chat/services/provider-tool-capability-matrix.ts`、`src/core/chat/services/current-loop-tool-surface-adapter.ts`、`src/core/chat/services/native-deferred-tool-surface-adapter.ts`。 |
| 完成后相同点 | 默认仍走当前自建两阶段路径；现有 provider 行为不变。 |
| 完成后差异点 | 业务层不再直接知道“tools/getTools 是怎么来的”；每个 provider 是否支持 native 能力由 capability matrix 决定。 |
| 验证方式 | 单元测试覆盖 capability matrix 决策与 adapter contract；集成测试确认当前 adapter 在 OpenAI-compatible 与 Claude 路径下结果一致；native adapter 只做 mock contract test，不正式上线。 |
| 回滚策略 | 关闭 `nativeDeferredAdapter`，强制走 current-loop adapter。 |
| Feature flag | `aiRuntime.nativeDeferredAdapter`，默认关闭。 |
| 与未来 native 升级关系 | 这是最后一道桥。Phase G 完成后，未来切 SDK 能力时只替换 adapter，不动业务层与 policy 层。 |
| 是否单独提交 commit | 是，但可以在确认 SDK 稳定前暂停不合入主线。 |
| 完成标准 | 1. current adapter 与 native adapter 共享同一输入输出契约。 2. 关闭 flag 时行为与 Phase F 完全一致。 3. provider-specific 分叉不再散落在聊天主链。 |

## 11. Phase H：测试、回归、清理旧逻辑

| 项目 | 说明 |
| --- | --- |
| 目标 | 固化测试矩阵、清理 shadow-only 逻辑、保留最小 emergency fallback，并为下一轮 native 迁移收口代码面。 |
| 本阶段不做什么 | 不在验证不充分前删除 emergency fallback；不提前移除所有 legacy alias。 |
| 影响范围 | 测试、文档、过渡 flag、旧注入路径的退场策略。 |
| 修改文件范围 | `src/**/*.test.ts`、[docs/tool-calling-audit.md](tool-calling-audit.md)、[docs/tool-calling-target-design.md](tool-calling-target-design.md)、本文件，以及 Phase C-D-E-F-G 中新增的 shadow / fallback 代码。 |
| 新增模块 / 类型 / 适配层 | 如需固化基线，建议新增 `src/core/chat/services/__fixtures__/tool-selection-regression.ts` 或同类数据集文件。 |
| 完成后相同点 | 用户可继续使用已验证的新链路；compat metadata 与 emergency fallback 仍可保留一个 release 周期。 |
| 完成后差异点 | 旧全量注入主路径不再是默认实现；shadow 统计与重复兼容逻辑被移除或封存。 |
| 验证方式 | `npm run lint`、`npm run test`、`npm run build`、真实 Obsidian 环境手工验证；对 curated prompt corpus 做一次全量回归；检查日志中不再依赖 shadow 差异判断。 |
| 回滚策略 | 保留 emergency flag，允许在一个 release 周期内切回 Phase C 前的全量注入路径；超过观察期后再删除。 |
| Feature flag | 不新增 flag；逐步退场 `toolDiscoveryCatalogV2`、`twoStageToolSelection`、`runtimeArgCompletionV2` 等过渡开关。 |
| 与未来 native 升级关系 | H 的目标是把当前自建两阶段收敛为稳定基线，为下一步 native adapter 实验留出干净起点。 |
| 是否单独提交 commit | 是，建议单独提交收尾 commit。 |
| 完成标准 | 1. 全量 lint/test/build 通过。 2. 回归语料通过率达到发布阈值。 3. 旧 shadow-only 逻辑完成清理或明确保留期限。 |

## 12. 测试计划

### 12.1 单元测试需要覆盖什么

1. discovery metadata 到 stableId / familyId / visibility 的映射。
2. CandidateScope 的 prefilter、scope cache、失效策略与 explicit filter 映射。
3. scoped MCP resolve：server 级 discovery、tool 级展开、同名工具冲突优先级。
4. 参数补全：alias、coercion、默认值、上下文注入、互斥与依赖校验。
5. wrapper 工具：stableId、providerCallName、legacy alias 与固定参数注入。
6. workflow mode 判定、workflow-only 与 atomic-only visibility。
7. provider capability matrix 与 adapter contract。

### 12.2 集成测试需要覆盖什么

1. 顶层聊天在 builtin-only 场景下走两阶段注入。
2. 顶层聊天在 builtin + MCP 场景下只连接候选 server。
3. `getTools` 在 loop 内刷新时只刷新当前 scope，而不是全量工具集。
4. 显式 workflow 请求仍能调用 Skill、sub-agent、write_plan、run_script、run_shell。
5. provider shared path 与 Claude path 在工具注入语义上一致。

### 12.3 回归测试需要覆盖什么

建议维护一组 curated prompt corpus，至少覆盖以下类别：

1. 已知路径读取、目录浏览、全文搜索、索引查询四类 vault 任务。
2. 时间查询、时区转换、时间范围计算。
3. 单网页抓取、批量抓取、raw 内容抓取。
4. 显式 Skill、sub-agent、write_plan、run_shell 请求。
5. MCP server 可用、不可用、延迟连接、工具同名冲突场景。

### 12.4 最重要的错误样本类型

1. 选错工具族：`find_paths` / `search_content` / `query_index` 混淆。
2. 候选集合漏掉正确工具。
3. 旧 alias 参数仍被模型使用。
4. `mode` / `view` / `response_format` 这类隐藏参数漏补全。
5. MCP 在 discovery 成功后、执行前掉线。
6. builtin 与 external MCP 工具同名冲突。
7. workflow / escape-hatch 被普通原子任务误选。

### 12.5 如何验证“少看 schema 后，工具仍能选对、参数仍能构对”

建议同时采用 shadow 对比和固定阈值：

| 指标 | 建议阈值 | 用途 |
| --- | --- | --- |
| Candidate recall | >= 98% | 正确工具至少进入候选 scope |
| First-call valid args rate | >= 95% | 第一次正式调用即可通过校验 |
| Tool execution success delta | 不低于基线 2 个百分点以上 | 防止隐藏 schema 后执行成功率明显下滑 |
| Tool token reduction | builtin-only >= 40%，含 MCP >= 60% | 验证两阶段是否真的缩小工具面 |
| Workflow false-positive rate | 显著低于旧链路 | 验证 workflow 分面收益 |

shadow mode 需要同时记录：

1. 旧链路实际使用的工具。
2. 新链路选出的 candidate scope。
3. 新链路第一次正式调用的参数是否合法。
4. 每轮注入的 tool token 估算值。

## 13. 阶段验收清单

| Phase | 可检查验收标准 |
| --- | --- |
| A | pass-through 接线后，工具数量、名称、执行器与当前基线完全一致。 |
| B | catalog 覆盖全部工具，且关闭 flag 后用户行为零变化。 |
| C | candidate recall 达标，且可一键回滚到全量注入。 |
| D | completion / validation 覆盖主要 alias 与隐藏参数，repair hint 可结构化返回。 |
| E | wrapper 与 legacy 结果一致，legacy 名称仍保留。 |
| F | workflow 工具从默认 atomic surface 移除，但显式请求仍可达。 |
| G | 当前 adapter 与未来 adapter 契约一致，关闭 native flag 时行为不变。 |
| H | lint/test/build/手工验证全部通过，旧 shadow-only 逻辑完成收口。 |

## 14. 推荐的提交顺序

1. Phase A：抽象类型与 pass-through coordinator。
2. Phase B：metadata sidecar、catalog builder、shadow telemetry。
3. Phase C：candidate scope、scoped resolve、scope-aware `getTools`。
4. Phase D：completion / validation / repair hints。
5. Phase E1：time wrappers。
6. Phase E2：vault wrappers。
7. Phase E3：fetch wrappers。
8. Phase F：workflow mode 与 visibility 切换。
9. Phase G：adapter seam 与 capability matrix。
10. Phase H：回归基线、清理与收尾。

## 15. 推荐的 PR 拆分方式

1. PR-1：Phase A + Phase B。目标是打地基，不改用户行为。
2. PR-2：Phase C。目标是完成两阶段选择链路。
3. PR-3：Phase D + Phase E。目标是提升构参稳定性并减少大 schema。
4. PR-4：Phase F。目标是把 workflow 与原子工具真正分面。
5. PR-5：Phase G + Phase H。目标是适配未来升级并完成收尾。

如果团队希望更细：把 Phase E 按 time / vault / fetch 再拆成三个小 PR。

## 16. 先做哪些最划算

1. Phase A：成本最低，后续所有阶段都依赖它。
2. Phase B：先把 metadata 真相建出来，后面才有 shadow 与候选过滤基础。
3. Phase C：这是收益最大的主链改造，直接降低 schema 注入量。
4. Phase D：这是两阶段能否稳定的关键补偿层。

如果只能做一半，优先完成 A、B、C、D，再决定是否继续做 E、F、G。

## 17. 哪些阶段可以暂停等待人工确认

1. Phase C 灰度完成后，可暂停一次，人工检查 candidate recall、MCP 连接成本与真实聊天体验。
2. Phase E 启用 wrapper 默认暴露前，可暂停一次，人工确认新工具命名与 discovery label 是否可接受。
3. Phase F 切掉 workflow 默认暴露前，可暂停一次，人工确认是否接受复杂任务的路由变化。
4. Phase G 可以长期暂停，等待 OpenAI / Anthropic / OpenRouter 的 native namespace / deferred loading 能力稳定后再推进。

在没有人工确认前，不建议直接删除 legacy 工具名、旧全量注入路径或 emergency fallback。

<!-- markdownlint-enable MD013 -->