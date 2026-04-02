# 2026-04-02 内置工具架构升级实施与新增工具目录

## 1. 新增工具规划

主文档：`docs/designs/2026-04-02-builtin-tool-architecture-upgrade.md`

## 1.1 第一批必须新增

### A. `ask_user`

- 家族：`workflow.user-clarification`
- 可见性：`workflow-only`
- 风险：`read-only`
- 优先级：P0

用途：

- 当模型缺少关键意图、路径、选择项时主动向用户提问。
- 用于消除歧义，减少误操作和返工。

输入建议：

```ts
{
  question: string;
  options?: Array<{
    label: string;
    value: string;
    description?: string;
  }>;
  allow_free_text?: boolean;
}
```

输出建议：

```ts
{
  answered: boolean;
  selected_value?: string;
  free_text?: string;
}
```

说明：

- 这是用户澄清工具，不是权限确认工具。
- 默认优先在聊天面板内渲染可选项；无 UI 能力时返回明确错误。

### B. `append_daily_note`

- 家族：`builtin.note.daily`
- 可见性：`default`
- 风险：`mutating`
- 优先级：P0

用途：

- 向今日笔记或指定日期笔记追加内容。
- 适合日记、会议纪要、灵感记录、对话总结、待办追加。

输入建议：

```ts
{
  date?: string; // YYYY-MM-DD，默认今天
  content: string;
  section_heading?: string;
}
```

输出建议：

```ts
{
  file_path: string;
  created: boolean;
  updated: boolean;
  inserted_under_heading?: string | null;
}
```

说明：

- 不应让模型自己猜 daily note 路径规则。
- 工具内部负责读取当前 Obsidian daily note 设置并解析目标文件路径。
- 是否创建、是否打开等流程/UI 决策不应作为普通工具参数暴露给模型。

### C. `property_edit`

- 家族：`builtin.vault.property`
- 可见性：`default`
- 风险：`mutating`
- 优先级：P0

用途：

- 结构化编辑 frontmatter / Properties。
- 替代脆弱的 `edit_file` 文本替换。

输入建议：

```ts
{
  file_path: string;
  operations: Array<
    | { action: 'set'; key: string; value: unknown }
    | { action: 'delete'; key: string }
    | { action: 'append'; key: string; value: unknown }
    | { action: 'remove'; key: string; value: unknown }
  >;
}
```

输出建议：

```ts
{
  file_path: string;
  updated_keys: string[];
  diff_preview?: string;
}
```

说明：

- 工具内部负责 YAML/frontmatter 解析与回写。
- `operations[].action` 仅限 frontmatter 变更族，不能继续膨胀为内容编辑类分流。

### D. `backlink_analyze`

- 家族：`builtin.graph.backlink`
- 可见性：`candidate-only`
- 风险：`read-only`
- 优先级：P0

用途：

- 分析指定笔记的反向链接、出链、双向链接和邻居节点。
- 让 AI 真正利用 Obsidian 图谱关系，而不是只把笔记当文件。

输入建议：

```ts
{
  file_path: string;
  include_outgoing?: boolean;
  include_unresolved?: boolean;
  depth?: 1 | 2;
}
```

输出建议：

```ts
{
  file_path: string;
  incoming: Array<{ path: string; count: number }>;
  outgoing?: Array<{ path: string; count: number }>;
  mutual?: Array<{ path: string }>;
  unresolved?: string[];
}
```

说明：

- 第一阶段只做一跳邻居分析。
- 第二阶段再考虑图谱聚类、中心性等高级指标。

## 1.2 第二批高价值工具

### E. `list_commands`

- 家族：`builtin.obsidian.commands`
- 可见性：`candidate-only`
- 风险：`read-only`
- 优先级：P1

用途：

- 列出当前 Obsidian 可执行命令，支持模糊筛选。
- 为 `run_command` 提供 discover -> invoke 工作流。

输入建议：

```ts
{
  query?: string;
  plugin_id?: string;
  max_results?: number;
}
```

输出建议：

```ts
{
  commands: Array<{
    id: string;
    name: string;
    plugin?: string | null;
  }>;
}
```

### F. `run_command`

- 家族：`workflow.obsidian.commands`
- 可见性：`workflow-only`
- 风险：`mutating`
- 优先级：P1

用途：

- 执行已知 command id。
- 用于打开面板、触发命令面板、运行社区插件命令等。

输入建议：

```ts
{
  command_id: string;
}
```

输出建议：

```ts
{
  command_id: string;
  executed: boolean;
}
```

说明：

- 确认应由 `checkPermissions()` 与 runtime 确认流处理，而不是模型普通参数。
- 对未知来源命令应保守处理。

### G. `list_mcp_resources`

- 家族：`builtin.mcp.resources`
- 可见性：`candidate-only`
- 风险：`read-only`
- 优先级：P1

用途：

- 列出已连接 MCP server 暴露的资源。
- 补足当前项目对 MCP 资源的模型可用性。

输入建议：

```ts
{
  server?: string;
  query?: string;
}
```

输出建议：

```ts
{
  resources: Array<{
    server: string;
    uri: string;
    name?: string;
    description?: string;
  }>;
}
```

### H. `read_mcp_resource`

- 家族：`builtin.mcp.resources`
- 可见性：`candidate-only`
- 风险：`read-only`
- 优先级：P1

用途：

- 读取指定 MCP 资源内容。

输入建议：

```ts
{
  server: string;
  uri: string;
}
```

输出建议：

```ts
{
  server: string;
  uri: string;
  content: unknown;
}
```

说明：

- 与 `list_mcp_resources` 配对设计。
- 走 discover -> read 模式，避免模型盲猜 URI。

## 1.3 第三批 Obsidian 原生增强工具

### I. `read_canvas`

- 家族：`builtin.canvas.read`
- 可见性：`candidate-only`
- 风险：`read-only`
- 优先级：P2

用途：

- 读取 `.canvas` 文件的节点、边和布局摘要。

### J. `edit_canvas`

- 家族：`builtin.canvas.write`
- 可见性：`workflow-only`
- 风险：`mutating`
- 优先级：P2

用途：

- 增删节点、更新文本、调整位置、增删连线。

### K. `dataview_query`

- 家族：`builtin.integration.dataview`
- 可见性：`candidate-only`
- 风险：`read-only`
- 优先级：P2

用途：

- 在安装 Dataview 时执行查询。

说明：

- 属于可选集成工具。
- 必须先检测插件是否存在，再决定是否暴露。

## 2. 明确不纳入首批范围的提议

### `grep_content`

不纳入原因：

- 当前已有 `search_content`。
- 当前 `search_content` 已支持：
  - `match_mode = literal | regex`
  - `context_lines`
  - 文件类型过滤

### `lsp_symbols`

不纳入原因：

- 更偏代码 IDE 场景，而不是 Obsidian 主场景。
- 依赖链更重，且与当前项目核心用户价值不完全匹配。

### `embed_search`

不纳入原因：

- 需要引入额外 embedding/vector infra。
- 不适合作为本轮内置工具架构升级的第一批功能。

### `config_read` / `config_update`

暂缓原因：

- 直接让 AI 读写插件配置属于高影响面能力。
- 需要先明确产品和权限策略，再决定是否开放。

## 3. 实施分期

## Phase 1：契约基础设施

目标：

- 扩展 `BuiltinTool`。
- 引入 `buildBuiltinTool()`。
- 扩展 `ToolContext` 为兼容式 `BuiltinToolExecutionContext`。
- 让 `BuiltinToolExecutor` 消费新的可选钩子。

涉及文件：

- `src/tools/runtime/types.ts`
- `src/tools/runtime/BuiltinToolExecutor.ts`
- `src/tools/runtime/tool-registry.ts`
- `src/tools/runtime/register-tool.ts`
- 新增 `src/tools/runtime/build-tool.ts`

验收标准：

- 旧工具不改也能继续运行。
- 新工具可使用 `validateInput` / `checkPermissions` / `isConcurrencySafe`。
- 执行器能在失败时输出结构化错误，而不是只有裸字符串。

## Phase 2：迁移高风险工具

迁移对象：

- `run_shell`
- `write_file`
- `edit_file`
- `delete_path`
- `move_path`
- `open_file`

要求：

- 为这些工具补齐动态风险和业务校验。
- 所有写入/破坏类工具都必须声明 `isReadOnly` / `isDestructive` / `checkPermissions`。
- 对长耗时工具补齐 `getActivityDescription` 与 `reportProgress`。

## Phase 3：收敛 surface 元数据

目标：

- 新工具的 `surface` 成为事实来源。
- `chat-tool-discovery-blueprints.ts` 改为：
  - fallback registry
  - migration bridge
  - external override

验收标准：

- 新增工具无需在工具本体之外重复写一份完整 surface 蓝图。

## Phase 4：重组工具目录

目标：

- 新增工具一律采用“每工具一目录”。
- 现有高风险 Vault 工具逐步迁移。

验收标准：

- 阅读单个工具行为时，不再需要跨 4 到 6 个文件来回跳转。

## Phase 5：新增工具落地

实现优先顺序：

1. `ask_user`
2. `append_daily_note`
3. `property_edit`
4. `backlink_analyze`
5. `list_commands`
6. `run_command`
7. `list_mcp_resources`
8. `read_mcp_resource`

## 4. 兼容性要求

- 所有现有工具名继续有效。
- `BuiltinToolExecutor` 的行为变更必须保持对旧工具对象兼容。
- 未迁移工具允许继续只实现 `execute()`，但在文档中列为 legacy shape。
- 任何会改变默认 tool surface 的升级，都必须在实现时同步更新：
  - `docs/architecture.md`
  - 对应 `docs/decisions/*`
  - 相关 release note

## 5. 实施验收清单

当后续实现完成时，至少满足以下标准：

- 新的 `BuiltinTool` 契约有完整类型定义和默认值工厂。
- `BuiltinToolExecutor` 支持：
  - tool-local validation
  - tool-local permission/confirmation
  - progress
  - output validation
- 至少 4 个高风险现有工具已迁移到新契约。
- 至少 2 个新增 Obsidian 场景工具已落地。
- 旧工具与旧对话不因契约扩展而失效。
- 架构文档与实现无明显漂移。

## 6. 最终结论

本项目后续的正确方向不是二选一：

- 不是继续维持“极薄工具 + 强系统”的当前状态不动。
- 也不是照搬 Claude Code 的“工具自带 UI 微应用”模式。

正确方向是第三条路：

> 保留当前项目成熟的外层 tool surface 与路由系统，同时把验证、权限、动态风险、进度和结果语义收回单工具契约，使每个工具成为可独立理解、可独立迁移、可独立验证的能力单元。
