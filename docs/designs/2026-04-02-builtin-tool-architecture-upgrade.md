# 2026-04-02 内置工具架构升级设计

## 状态

- 状态：已实施
- 适用范围：`src/tools/**` 下的内置工具
- 不适用范围：外部 MCP 服务实现、Provider 专属协议适配、聊天 UI 组件渲染

## 1. 目标

本设计文档用于指导当前项目对“内置工具”进行一次可渐进落地的架构升级。

本次升级只回答三个问题：

1. 单个内置工具应该拥有哪些一等公民能力。
2. 这些能力应该放在工具本身，还是放在运行时/路由框架层。
3. 在保持当前项目两阶段 tool surface 优势的前提下，如何把单工具契约做强。

本文基于三类证据收敛：

- 当前仓库源码现状。
- 已有 ADR：`docs/decisions/2026-04-01-tool-surface-two-stage.md`。
- 两份外部分析文档中相互一致、且能被源码证实的结论。

## 2. 结论摘要

### 2.1 当前项目真正的优势

当前项目的优势主要不在 `BuiltinTool` 本体，而在外层工具系统：

- 已有成熟的两阶段 surface 设计：discovery catalog -> candidate scope -> executable set。
- 已有 wrapper/canonical/legacy 的兼容策略。
- 已有通用参数补全、上下文默认值、错误上下文与修复提示。
- 已有将工具路由、风险、可见性、兼容性从 provider 侧独立出来的系统能力。

这些设计应该保留，并继续作为项目的长期架构方向。

### 2.2 当前项目真正的短板

当前项目的短板在于单个内置工具契约过薄：

- `BuiltinTool` 目前只表达“名称、描述、schema、execute”。
- 工具级语义校验、权限/确认、动态风险、并发语义、进度、结果映射等能力没有进入工具本体。
- 工具 surface 元数据与工具定义分散在多处，存在漂移风险。

### 2.3 最终决策

本项目不应照搬 Claude Code 的胖工具对象，也不应维持当前极薄的 `BuiltinTool` 不变。

最终采用的目标形态是：

- 保留当前项目“外层 surface 强、wrapper 明确、兼容层稳定”的系统设计。
- 扩展单工具契约，使工具能声明自己的验证、权限、运行时语义和结果表达。
- 明确不把 React/UI 渲染方法塞进工具对象。
- 通过 `buildBuiltinTool()` 提供 fail-closed 默认值。
- 逐步把工具 surface 元数据从外部蓝图收敛回工具邻近位置，降低重复维护成本。

一句话概括：

> 目标不是把内置工具做成“微应用”，而是把它做成“具备完整执行语义的能力单元”。

## 3. 非目标

以下内容不在本次架构升级首轮范围内：

- 不把 `src/tools/**` 直接改造成 Claude Code 那种“工具自带 UI 渲染”模式。
- 不把整个聊天 UI 或转录渲染耦合进单工具定义。
- 不重写现有的 `ToolDefinition`、`ToolDiscoveryMetadata`、`ToolRuntimePolicy` 总体模型。
- 不一次性迁移所有工具目录结构。
- 不在第一阶段引入额外浏览器测试框架或复杂可视化渲染层。

## 4. 当前现状

### 4.1 当前单工具契约

当前 `BuiltinTool` 只有以下核心字段：

```ts
export interface BuiltinTool<TArgs = unknown> {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: z.ZodTypeAny;
  readonly outputSchema?: z.ZodTypeAny;
  readonly annotations?: McpToolAnnotations;
  execute(args: TArgs, context: ToolContext): Promise<unknown> | unknown;
}
```

这意味着单个工具当前只负责：

- 描述输入。
- 执行逻辑。
- 声明少量静态 MCP 注释。

### 4.2 当前已经在系统层存在的能力

当前项目外层已经拥有以下重要能力：

- `ToolDiscoveryMetadata`：可见性、风险等级、能力标签、用途摘要。
- `ToolRuntimePolicy`：默认参数、隐藏字段、上下文默认值、校验 schema。
- `ToolCompatibilityMetadata`：legacy 名称、弃用状态、兼容 hints。
- `completeToolArguments()`：snake_case 归一、默认值注入、选区/活动文件补全。
- `ToolErrorContext`：参数问题、修复建议、fallback tool 提示。

### 4.3 当前存在的具体问题

#### 问题 A：工具级语义无法完整表达

当前工具本体无法表达：

- 这个工具是否并发安全。
- 这个工具是否会写入。
- 这个工具是否可能 destructive。
- 这个工具是否可以被用户中断。
- 这个工具在长执行时如何汇报进度。
- 这个工具除了 schema 之外还有哪些业务前置验证。

#### 问题 B：工具语义分散在多处

同一个工具的信息目前可能同时分散在：

- `src/tools/**` 的工具定义或 handler。
- `chat-tool-discovery-blueprints.ts`。
- `tool-call-argument-completion.ts`。
- `tool-call-validation.ts`。
- 若干 runtime helper。

这会导致：

- 新增工具时需要跨多文件同步。
- 阅读单个工具行为时需要跳转多处。
- surface 和 execute 之间容易发生语义漂移。

#### 问题 C：工具目录组织更偏“按处理器类别”而不是“按工具”

以 Vault 工具为例，当前组织是：

- `filesystemReadWriteHandlers.ts`
- `filesystemSearchHandlers.ts`
- `filesystemToolSchemas.ts`
- `filesystemToolDescriptions.ts`

这种布局适合快速集中开发，但随着工具数量变多，会降低单工具的可发现性。

## 5. 设计原则

### 原则 1：保留两层模型，不混层

本项目继续保留两层：单工具执行契约负责工具知识，tool surface /
路由系统负责 discovery、候选筛选、provider 适配与安全收敛。任何新增能力都必须
先判断属于“工具知识”还是“框架编排”。

### 原则 2：工具必须单责

- 一个工具只表达一个主动作、一个主对象、一个主作用范围。
- 不允许通过大 `action` / `mode` 参数把发现、读取、变更或不同对象层级混进同一工具。
- 允许小范围模式参数，但不能改变工具的主语义、风险等级或结果类型。

### 原则 3：工具本身拥有知识，框架拥有编排

- 工具本身负责：输入语义、业务前置验证、动态风险、权限/确认需求、进度摘要、
  结果序列化偏好。
- 框架负责：当前轮暴露哪些工具、provider 看到什么 schema、如何补全环境参数、
  如何根据任务签名筛选 candidate、如何格式化错误并写回历史。

### 原则 4：fail-closed 默认值

- 未声明是否只读：按“非只读”处理。
- 未声明是否可并发：按“不可并发”处理。
- 未声明中断行为：按“block”处理。
- 未声明权限策略：按“allow but no escalation”处理；写入类工具迁移时必须显式
  声明 `checkPermissions()`。

### 原则 5：参数责任划分规范

- 用户负责决定的参数才暴露给模型，例如查询词、追加内容、替换内容、过滤条件。
- 环境参数由系统补全，例如活动文件、选区、当前日期、Vault/Workspace 上下文。
- 流程参数必须来自上一步工具结果或系统解析，例如搜索得到的候选 ID、section
  anchor、解析器生成的 patch anchor。
- 安全确认、审批、白名单判定不是普通参数，必须通过 `checkPermissions()` /
  `requestConfirmation()` 完成。
- 目标表达方式必须单一：当前对象类工具不要再显式 `target`；显式对象类工具使用
  稳定标识；搜索类工具只接查询条件。

### 原则 6：单工具立项模板

每个新增或重构工具在立项时都必须先写清以下内容：

1. 身份定义：`name`、`family/namespace`、主动作、主对象、主作用范围。
2. 使用边界：一句话用途、何时使用、何时不要使用、前置条件、结果类型。
3. 参数责任：哪些参数来自用户、哪些由环境补全、哪些必须来自前一步结果、哪些
   严禁模型猜测。
4. 执行边界：风险等级、只读/写入、是否需要显式确认、是否允许批量作用、失败后
   是否允许自动重试。
5. 描述文本：参数构造规则、禁止推断项、调用前必须具备的上下文。

### 原则 7：不把 UI 渲染耦合进工具对象

本项目明确不采用 `renderToolUseMessage()` / `renderToolResultMessage()` /
`renderToolUseErrorMessage()` 这类模式。工具负责产出结构化进度事件、简短摘要和
活动描述；上层聊天 UI 负责最终展示。

## 6. 目标架构

## 6.1 新的单工具契约

建议把 `BuiltinTool` 扩展为以下形态：

```ts
export interface BuiltinTool<TArgs = unknown, TResult = unknown, TProgress = never> {
  readonly name: string;
  readonly title?: string;
  readonly aliases?: readonly string[];

  readonly description:
    | string
    | ((context: BuiltinToolDescriptionContext) => string | Promise<string>);

  readonly prompt?:
    | string
    | ((context: BuiltinToolDescriptionContext) => string | Promise<string>);

  readonly inputSchema: z.ZodType<TArgs>;
  readonly outputSchema?: z.ZodType<TResult>;
  readonly annotations?: McpToolAnnotations;

  readonly surface?: BuiltinToolSurfaceSpec;
  readonly runtimePolicy?: BuiltinToolRuntimePolicy;

  isEnabled?(): boolean;
  isReadOnly?(args: TArgs): boolean;
  isDestructive?(args: TArgs): boolean;
  isConcurrencySafe?(args: TArgs): boolean;
  interruptBehavior?(args: TArgs): 'cancel' | 'block';
  toClassifierInput?(args: TArgs): unknown;

  validateInput?(
    args: TArgs,
    context: BuiltinToolExecutionContext
  ): Promise<BuiltinValidationResult> | BuiltinValidationResult;

  checkPermissions?(
    args: TArgs,
    context: BuiltinToolExecutionContext
  ): Promise<BuiltinPermissionDecision<TArgs>> | BuiltinPermissionDecision<TArgs>;

  getToolUseSummary?(args: Partial<TArgs>): string | null;
  getActivityDescription?(args: Partial<TArgs>): string | null;
  serializeResult?(result: TResult, context: BuiltinToolExecutionContext): unknown;
  extractSearchText?(result: TResult): string;

  execute(
    args: TArgs,
    context: BuiltinToolExecutionContext
  ): Promise<TResult> | TResult;
}
```

### 设计说明

- `execute` 保留原名，不改成 `call`，以降低迁移成本。
- `description` 和 `prompt` 分离：
  - `description` 是工具对模型暴露的正式说明。
  - `prompt` 是可选的扩展说明，用于 tool-search、surface guidance 或未来系统提示增强。
- `surface` 成为工具邻近的元数据来源。
- `runtimePolicy` 继续保留，与当前项目现有两阶段 surface 模型兼容。
- 长自由文本输入不应被过度 JSON 化；若后续 provider 支持 raw-text / custom tool，
  应优先由 surface 层封装，而不是把单工具 schema 膨胀成复杂嵌套结构。

## 6.2 新增 supporting types

### `BuiltinToolDescriptionContext`

```ts
export interface BuiltinToolDescriptionContext {
  readonly app: App;
  readonly activeFilePath?: string | null;
  readonly enabledToolNames?: readonly string[];
  readonly sessionMode?: 'default' | 'plan' | 'workflow';
}
```

要求：

- 只允许只读上下文。
- 不允许带副作用对象。
- 不允许把整个聊天状态树直接塞进这里。

### `BuiltinValidationResult`

```ts
export type BuiltinValidationResult =
  | { ok: true }
  | {
      ok: false;
      summary: string;
      issues?: readonly ToolValidationIssue[];
      repairHints?: readonly ToolRepairHint[];
      notes?: readonly string[];
    };
```

要求：

- 新增工具的业务校验优先返回结构化错误。
- `BuiltinToolExecutor` 负责把它转成现有 `ToolErrorContext`。

### `BuiltinPermissionDecision`

```ts
export type BuiltinPermissionDecision<TArgs> =
  | { behavior: 'allow'; updatedArgs?: TArgs; notes?: readonly string[] }
  | { behavior: 'deny'; message: string; escalatedRisk?: ToolRiskLevel }
  | {
      behavior: 'ask';
      message: string;
      updatedArgs?: TArgs;
      escalatedRisk?: ToolRiskLevel;
      confirmation?: {
        title: string;
        body?: string;
        confirmLabel?: string;
      };
    };
```

说明：

- `ask` 不等同于外部权限系统的全局模式，而是单工具表达“这次调用应请求用户确认”。
- 这套机制主要面向：
  - `run_shell`
  - `delete_path`
  - `run_command`
  - 未来的设置修改类工具

### `BuiltinToolExecutionContext`

```ts
export interface BuiltinToolExecutionContext extends ToolContext {
  readonly abortSignal?: AbortSignal;
  readonly activeFilePath?: string | null;
  readonly selectedTextContext?: {
    readonly filePath?: string | null;
    readonly startLine?: number;
    readonly endLine?: number;
  } | null;
  readonly reportProgress?: (event: BuiltinToolProgressEvent<TProgress>) => void;
  readonly requestConfirmation?: (
    request: BuiltinToolConfirmationRequest
  ) => Promise<BuiltinToolConfirmationResponse>;
}
```

说明：

- 保持与当前 `ToolContext` 兼容，新增字段全部是 optional。
- 第一阶段不要求所有调用方都提供这些字段。

## 6.3 `buildBuiltinTool()` 与默认值

新增 `buildBuiltinTool()`，为工具提供 fail-closed 默认值：

```ts
const BUILTIN_TOOL_DEFAULTS = {
  isEnabled: () => true,
  isReadOnly: () => false,
  isDestructive: () => false,
  isConcurrencySafe: () => false,
  interruptBehavior: () => 'block' as const,
  validateInput: () => ({ ok: true } as const),
  checkPermissions: () => ({ behavior: 'allow' } as const),
  getToolUseSummary: () => null,
  getActivityDescription: () => null,
};
```

- 新工具必须经过 `buildBuiltinTool()` 创建。
- 直接手写裸对象仍兼容一个过渡周期，但会被标记为待迁移模式。

## 7. 目标执行流水线

`BuiltinToolExecutor` 的目标执行顺序如下：

1. 解析 provider 返回的 JSON 参数。
2. 运行现有 `completeToolArguments()`：
   - key normalization
   - default args
   - context defaults
3. 使用 `inputSchema` 做结构校验。
4. 调用 `tool.validateInput()` 做业务语义校验。
5. 调用 `tool.checkPermissions()`：
   - allow：继续
   - deny：返回结构化失败
   - ask：通过 host confirmation 通道向用户确认
6. 依据 `isConcurrencySafe()`、`interruptBehavior()`、`isReadOnly()` 等运行时属性写入执行记录。
7. 执行 `tool.execute()`。
8. 若存在 `outputSchema`，对结果做输出校验。
9. 使用 `serializeResult()` 或默认结果序列化逻辑生成模型侧结果。
10. 将摘要、进度、动态风险等信息回传 UI 与历史记录。

## 8. 元数据收敛策略

## 8.1 保留外层 surface，但改变“事实来源”

当前项目不应删除 `ToolDefinition` / `ToolDiscoveryMetadata` / `ToolRuntimePolicy`。

但事实来源应逐步改为：

1. 单个工具旁边的 `surface` / `runtimePolicy`。
2. 外层蓝图文件只保留：
   - fallback
   - override
   - legacy 兼容过渡
   - 外部 MCP 映射

## 8.2 收敛后的职责分配

### 工具本身持有

- `name` / `aliases`
- `description` / `prompt`
- schema
- 运行时动态属性
- 验证
- 权限/确认
- 进度描述
- 结果序列化偏好
- `surface`
- `runtimePolicy`

### 外层系统持有

- 路由评分
- 默认暴露数量上限
- 当前轮 capability domain 选择
- provider message 组装
- 最终错误格式化

## 9. 文件组织策略

## 9.1 目标组织方式

不建议继续把 Vault 工具长期维持在“大 handler 文件 + 大 schema 文件”的模式。

目标结构：

```text
src/tools/vault/
  _shared/
    helpers.ts
    path.ts
    result.ts
    query.ts
  read-file/
    tool.ts
    schema.ts
    description.ts
    service.ts
  edit-file/
    tool.ts
    schema.ts
    description.ts
    service.ts
  search-content/
    tool.ts
    schema.ts
    description.ts
    service.ts
```

说明：

- “每工具一目录”是目标组织方式。
- 共享 helper 继续保留，但工具 manifest 必须集中在单工具目录。
- 首轮不强制所有工具都迁移，只要求新增工具和高风险工具采用新结构。

## 9.2 迁移优先级

优先迁移下列工具到新结构：

1. `run_shell`
2. `write_file`
3. `edit_file`
4. `delete_path`
5. `open_file`
6. `fetch_webpage`
7. `fetch_webpages_batch`
8. `query_index`

## 10. 配套文档

实施与新增工具细节已拆到配套文档：

- `docs/designs/2026-04-02-builtin-tool-implementation-and-catalog.md`

该文档包含新增工具目录、排除项、分阶段实施计划、兼容性要求与最终验收清单。
