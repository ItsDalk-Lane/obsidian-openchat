# ADR 2026-04-01: 工具调用采用两阶段 Surface

## 状态

已采纳

## 背景

- 默认 runtime 过去会暴露过多 builtin、MCP 与 per-agent 工具，模型在默认轮次里容易选错工具。
- provider request 在协调层已经拿到了 discovery payload，但真实的 provider message 构建路径没有消费它，导致“看见的工具边界”和“实际可执行边界”不一致。
- runtime argument completion 曾经包含 repo/url 语义猜参和必填字段猜补，容易把错误参数补成“看起来合理但实际上错误”的调用。
- Skill 与 Sub-Agent 之前以大 prompt 列表或 one-tool-per-agent 方式暴露，schema 与上下文都会膨胀。
- `list_directory` 的 flat surface 之前只是 runtimePolicy 级别的伪收窄，不是真实 wrapper，模型仍可能继承 legacy schema 心智。

## 决策

1. 工具调用采用三层模型：discovery catalog → candidate scope → executable tool set。
2. 默认 runtime 只暴露 `discoveryVisibility = default` 的 canonical 工具。
3. `candidate-only`、`workflow-only`、`hidden` 工具必须经过显式选择后才能进入 executable tool set。
4. 外部 MCP 不再在“没有任何命中”时 fallback 为全量 server 候选；只有 query 命中 server 能力标签或显式指定 server/tool 时才注入。
5. wrapper 必须是真实工具，而不是通过 runtimePolicy 伪装 legacy schema。当前 canonical wrapper 以窄 schema 为准：
   - `list_directory_flat`
   - `list_directory_tree`
   - `list_vault_overview`
   - `get_current_time`
   - `convert_time`
   - `calculate_time_range`
   - `fetch_webpage`
   - `fetch_webpages_batch`
6. Skill 与 Sub-Agent 统一改为 discover + invoke/delegate 两步 surface：
   - Skill: `discover_skills` → `invoke_skill`
   - Sub-Agent: `discover_sub_agents` → `delegate_sub_agent`
7. provider system prompt 只接收压缩后的 tool-surface guidance，不再依赖超长 description、全量 skills 列表或 per-agent schema 爆炸。
8. runtime argument completion 只允许显式 alias、snake_case/key normalization、类型 coercion、声明式默认值与上下文默认值；禁止 repo/url 语义猜参与唯一字符串必填映射。
   其中当前轮 user message 的 `selectedTextContext` 已进入 execution-time completion：
   - 文件类工具可优先从“选区所在文件路径”补全 `file_path` / `target_path`，再回退到活动文件。
   - `read_file` 在宿主层提供选区行号时，可继续补全 `start_line` 与 `line_count`，把“解释这段/读取这段”真正收敛到局部读取，而不只停在路由层。
9. legacy 工具名可以为兼容性继续保留执行能力，但默认不再作为 canonical discovery surface 暴露。
10. 初始暴露路由器按四个连续阶段运行，而不是直接用 query 扁平筛工具：

- 任务签名提炼：只提炼与下一步工具路由直接相关的行为特征、目标明确度、范围、写入意图与现有上下文。
- 候选打分：按能力域匹配、目标适配、上下文适配、工作流先验、字面召回、风险与复杂度抑制做综合评分。
- 能力域选择：先决定当前轮次开放哪些能力域，再决定各域内的少量具体工具。
- 安全收敛：统一施加首轮数量上限、每域上限、高风险默认禁入与高不确定保守模式。

1. 任务签名提炼读取的是“瞬时路由上下文”，而不是扩写会话持久态。当前明确纳入三类信号：

- 当前活动笔记路径。
- 当前选区/已选文件/已选文件夹；如果宿主层拿得到真实选区范围，还会携带选区所在文件路径与 range。
- 最近一轮 discovery 或 search 工具的结果摘要；其中 `query_index` 会保留 `data_source`、字段列表与代表性路径，`bing_search` 会保留查询词与顶部 URL，而不只停在数量与粗目标类型。

这些信号只用于当前轮次的候选路由，不写回 `ChatSession` 历史结构。

1. 同一份 `selectedTextContext` 现在还会进入 provider prompt 层：

- `selected_text` 上下文文档会显式带上其文件锚点；若宿主层提供了行号，还会带上行范围。
- system prompt 会追加紧凑的 selection guidance，明确告诉模型这份 `selected_text` 对应哪个文件/范围，并把“优先局部读取、优先最小局部编辑”作为默认策略。
- 这层 guidance 不重复注入选中文本正文，只补文件与范围锚点，以及局部编辑行为约束。

1. `edit_file` 的默认策略继续收紧到“最小局部修改”：

- 优先围绕当前选区或已知局部片段构造最小 `oldText` 锚点，而不是扩大为整文件重写。
- 若片段定位不唯一或上下文不足，先用 `read_file` 读取目标范围，再提交更小、更稳的 `edits`。
- 这类行为约束落在 provider prompt 与工具说明层，不放进 argument completion 去猜测或重写 `edits` 内容。

## 直接后果

- 默认轮次的工具集合更小，模型更容易在不反复读 schema 的情况下选对工具。
- MCP 工具不会因为“没有命中任何工具”而整批进入候选池，减少错误调用与上下文噪音。
- workflow 家族不再靠 one-tool-per-agent 扩张 provider schema，Skill 与 Sub-Agent 都改为稳定的通用入口。
- wrapper 的名字、schema 和用途一致，模型心智与真实执行行为更接近。
- 工具首轮暴露从“功能对不对”转为“当前阶段的下一步动作最需要什么”，目标未明确时优先发现，阶段推进后再切换到读取、修改或 workflow 执行。
- 四阶段实现边界更清晰：环境提炼、候选打分、能力域选择、安全收敛分别由独立模块负责，resolver 只保留编排职责。

## 实施约束

- 新 builtin 工具必须先定义 discovery blueprint，再决定其 `default`、`candidate-only`、`workflow-only` 或 `hidden` visibility。
- 新 workflow 家族优先设计成“发现工具 + 执行工具”的通用 surface，而不是为每个实例生成一个 provider-visible tool。
- 新 wrapper 若只是“帮 legacy 工具预填参数”，也必须以真实独立工具落地，不能只靠隐藏字段描述来伪装。
- 若 provider path 新增工具注入逻辑，必须同步传递 discovery payload 与 executable payload，避免 prompt surface 与 runtime surface 再次分叉。

## 参考实现

- `src/core/chat/services/chat-tool-runtime-resolver.ts`
- `src/core/chat/services/chat-tool-candidate-resolver.ts`
- `src/core/chat/services/chat-tool-routing-context.ts`
- `src/core/chat/services/chat-tool-routing-domain-selection.ts`
- `src/core/chat/services/chat-tool-routing-safety-policy.ts`
- `src/core/chat/services/chat-tool-surface-prompt.ts`
- `src/core/agents/loop/tool-call-argument-completion.ts`
- `src/tools/skill/skill-tools.ts`
- `src/tools/sub-agents/subAgentTools.ts`
- `src/tools/vault/filesystemWrapperTools.ts`
- `src/services/mcp/mcpToolArgHelpers.ts`
