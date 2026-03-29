# docs/architecture.md — 分层架构规范

## 架构哲学

> "Agents are most effective in environments with strict boundaries
> and predictable structure."
> — OpenAI Harness Engineering

本项目采用 **分域分层架构（Domain-Layered Architecture）**。
这套架构在人类开发中可能显得过于严格，但对 AI 驱动的开发来说，
约束是加速器——一旦编码，它们无处不在地生效。

## 分层规则

每个业务域内部包含固定的四层，依赖方向严格单向：

```text
Types → Config → Service → UI
```

### 各层职责

#### Types（类型层）

- 该域所有的 interface、type、enum、discriminated union
- 零依赖（不导入本域其他层，不导入其他域）
- 纯数据结构定义，无逻辑

#### Config（配置层）

- 该域的默认配置值、配置 schema 验证
- 只能导入：本域 Types
- 包含配置迁移函数（如 migrateV1ToV2）

#### Service（服务层）

- 该域的核心业务逻辑
- 只能导入：本域 Types、本域 Config、Providers
- 优先使用纯函数；有副作用的函数必须在函数名中体现
- 使用 Result 模式处理可预期错误

#### UI（界面层）

- Obsidian UI 组件：Modal、SettingTab、View、MarkdownPostProcessor 等
- 只能导入：本域 Types、本域 Config、本域 Service、Providers
- UI 类只作为薄壳，调用 Service 层的纯函数
- 继承 Obsidian 基类可以，但禁止自定义中间继承层

### 依赖规则矩阵

| 源 → 目标 | Types | Config | Service | UI | 其他域 | Providers |
| --------- | ----- | ------ | ------- | -- | ------ | --------- |
| Types     | —     | ❌     | ❌      | ❌ | ❌     | ❌        |
| Config    | ✅    | —      | ❌      | ❌ | ❌     | ❌        |
| Service   | ✅    | ✅     | —       | ❌ | ❌     | ✅        |
| UI        | ✅    | ✅     | ✅      | —  | ❌     | ✅        |

- ❌ = 禁止导入，lint-arch 会报错
- ✅ = 允许导入
- 域间不允许直接导入。如果两个域需要协作，通过 Providers 或事件总线

### 依赖传递模式（强制）

- 通过构造函数或方法参数传递插件实例（`app`, `plugin`, `settings`）
- 禁止在模块间使用全局变量或单例模式传递状态
- 子模块不持有对 `Plugin` 实例的反向引用，而是接收所需的最小接口

```typescript
// ✅ 正确：接收最小接口
class NoteService {
    constructor(private app: App, private settings: PluginSettings) {}
}

// 🚫 错误：接收整个插件实例
class NoteService {
    constructor(private plugin: MyPlugin) {}
}

### 跨域关注点：Providers

```text
src/providers/
├── obsidian-api.ts # Obsidian Vault/Workspace API 的类型安全薄封装
├── settings.ts # 全局设置的读写接口
├── event-bus.ts # 域间通信的事件总线
└── providers.types.ts # Provider 接口定义
```

- 所有对 Obsidian API 的调用必须通过 providers/obsidian-api.ts
- 当 Obsidian API 变更时只需修改一处
- Provider 是显式的依赖注入点，不是隐式的全局单例
- 域层只能依赖 providers/providers.types.ts 中的契约；
   provider 实现只能在 main.ts、core 或命令层组合根中创建后再注入
- providers/settings.ts 与 providers/event-bus.ts 不得直接依赖
   obsidian；chat/editor/settings 这些已收口的业务链路统一通过
   providers/obsidian-api.ts 暴露共享宿主能力
- provider 实现允许依赖稳定的共享工具模块（如 src/utils/AIPathManager），
   但不得反向依赖 domains、core、commands 或其他 provider 实现

### 全仓纳管范围

- 当前 lint-arch / lint-taste / arch.test 已纳管 `infra/` 与整个 `src/`
- 不再使用“大面积默认 consumer”兜底；所有真实源码文件都必须命中显式类别：
  - `module/root`：`src/main.ts`、`src/core/FeatureCoordinator.ts`、`src/core/PluginStartupCoordinator.ts`
  - `module/command`：`src/commands/**`
  - `module/component`：`src/components/**`
  - `module/editor`：`src/editor/**`
  - `module/runtime-adapter`：`src/LLMProviders/**`
  - `module/tool`：`src/tools/**`
  - `module/settings`、`module/service`、`module/type`、`module/shared`：legacy 共享与兼容区域
  - `chat/*`：`src/core/chat/**` 与 `src/commands/chat/**` 中仍保留的 legacy chat 组合根/服务
  - `shim/*`：旧路径兼容出口，只允许 import/export/type alias
- `src/domains/**` 继续作为最终目标形态；legacy 目录依然存在，但它们现在同样受全仓护栏约束
- settings 域当前仍复用 `src/settings/ai-runtime` 与 `src/types/chat` 中的共享运行时类型，
   这是迁移期的显式 shim；这类文件必须保持“仅转发、无业务逻辑”
- chat 域当前除共享类型、默认配置与纯 helper 外，新增承接了：
  - `src/domains/chat/ui-view-coordinator.ts`
  - `src/domains/chat/ui-view-coordinator-support.ts`
  - `src/domains/chat/ui-markdown.ts`
  旧的 `src/commands/chat/chat-view-coordinator.ts`、
  `src/commands/chat/chat-view-coordinator-ui.ts` 与
  `src/core/chat/utils/markdown.ts` 仅保留兼容 shim
- quick-actions 域当前已承接快捷操作的核心持久化与执行逻辑：
  - `src/domains/quick-actions/service-data.ts`
  - `src/domains/quick-actions/service-execution.ts`
  - `src/domains/quick-actions/service-data-utils.ts`
  - `src/domains/quick-actions/service-group-helpers.ts`
  editor 旧路径 `src/editor/selectionToolbar/QuickActionDataService.ts`、
  `src/editor/selectionToolbar/QuickActionExecutionService.ts`、
  `src/editor/selectionToolbar/quickActionDataUtils.ts` 与
  `src/editor/selectionToolbar/quickActionGroupHelpers.ts` 仅保留兼容 shim；
  settings quick-actions 面板通过 `ObsidianApiProvider` 派生的 host adapter 获取通知与 Vault 读写能力
- settings 启动链路现已拆成 bootstrap 与 deferred hydrate 两阶段：
   `main.ts` 只负责注册、异步触发 bootstrap，真正的系统提示词迁移、MCP Markdown 同步、
   AI 数据目录整理与 MCP 初始化延后到 `onLayoutReady` 后的编排阶段执行
- chat consumer 组合根现已通过 `ChatConsumerHost` 收敛宿主依赖：
   `src/core/FeatureCoordinator.ts` 创建 host adapter，
   `createChatServiceDeps()`、`ChatFeatureManager`、`ChatViewCoordinator` 与
   `ChatEditorIntegration` 只接收最小接口，不再继续传递 `OpenChatPlugin`
- AI runtime 命令层现已通过 `AiRuntimeCommandHost` 收敛状态栏、命令注册与 Notice，
   `AiRuntimeCommandManager` 不再直接持有 `Plugin`

## 机械化执行

这些规则不是建议，是通过以下机制强制执行的：

### 架构 Linter（lint-arch.ts）

扫描所有 import 语句，验证是否符合依赖方向规则。
违规时，错误信息包含修复指导：

```text
❌ ARCH VIOLATION: src/domains/sync/ui.ts imports from
src/domains/editor/service.ts
域间直接导入被禁止。
修复方法：
1. 如果需要共享数据，将公共类型提取到 providers/
2. 如果需要触发行为，通过 providers/event-bus.ts 发送事件
3. 参考 docs/architecture.md "跨域关注点" 章节
```

### 结构测试

```typescript
// infra/arch.test.ts
describe('架构约束', () => {
  it('Types 层不导入本域其他层', () => { ... });
  it('Config 层只导入本域 Types', () => { ... });
  it('Service 层不导入 UI 层', () => { ... });
  it('域间无直接导入', () => { ... });
  it('已收口的 chat/editor/settings 宿主行为通过 providers/obsidian-api.ts', () => { ... });
});
```

### 品味不变量 Linter（lint-taste.ts）

|规则|说明|错误信息中的修复指导|
|---|---|---|
|文件大小|单文件不超过 500 行|按子功能拆分到同一 domain 目录内|
|命名规范|文件名 kebab-case，类型 PascalCase，函数 camelCase|给出正确命名示例|
|结构化日志|禁止 console.log，使用项目日志工具|给出替代调用方式|
|无 any|禁止隐式或显式 any|建议使用 unknown + 类型守卫|
|无 barrel export|禁止 index.ts re-export|直接导入具体文件|
|无 folder import|禁止通过目录路径命中 `index.ts`|直接导入具体文件|
|副作用命名|有副作用的函数名必须含动词前缀（save/mutate/register/delete）|给出命名模板|

## 模块依赖图

（每次新增或删除域时更新此图）

```text
main.ts
├── domains/settings/*        → bootstrap / merge / save / migrate 接缝
├── core/PluginStartupCoordinator.ts
│   └── 编排 bootstrap settings、deferred hydrate、目录迁移与 MCP 初始化
├── core/FeatureCoordinator.ts
│   ├── commands/ai-runtime/AiRuntimeCommandManager.ts
│   ├── core/chat/chat-feature-manager.tsx
│   ├── 创建 ChatConsumerHost 并注入 chat legacy 组合根
│   ├── domains/skills/ui.ts
│   └── domains/mcp/ui.ts
├── core/chat/services/chat-service.ts
│   ├── chat-service-facades.ts
│   ├── chat-service-provider-api.ts
│   ├── chat-service-state-api.ts
│   └── create-chat-service-deps.ts
├── commands/ai-runtime/AiRuntimeCommandManager.ts
│   ├── 通过 AiRuntimeCommandHost 注册命令、状态栏与 editor extension
│   └── domains/editor  → providers/obsidian-api, providers/event-bus
└── 其他 legacy 区域         → 逐步迁移中，暂未纳入 domains/
```

## 数据流

（描述核心数据流向，每次架构变更时更新）

```text
插件启动或用户保存设置
   → main.ts 先以 DEFAULT_SETTINGS 同步注册 chat view、设置页与 ai-runtime 命令
   → core/PluginStartupCoordinator.ts 触发 bootstrap settings 读取
   → domains/settings/service.ts 读取 data.json、解密 aiRuntime、裁剪 legacy 字段
   → main.ts 用 bootstrap settings 刷新 ai-runtime 运行时
   → core/FeatureCoordinator.ts 创建 ChatConsumerHost，并用最小宿主接口装配 chat 运行时
   → onLayoutReady 后 core/PluginStartupCoordinator.ts 再执行 settings hydrate、
      AI 数据目录整理、旧数据清理与 MCP 初始化
   → core/FeatureCoordinator.ts 刷新 ai-runtime / chat / mcp 运行时

用户在编辑器中按触发键
   → core/FeatureCoordinator.ts 创建 ObsidianApiProvider 与 AiRuntimeCommandHost
   → commands/ai-runtime/AiRuntimeCommandManager 读取 aiRuntime 设置并组装 editor runtime
   → domains/editor/ui.ts 接收键盘事件并维护 CodeMirror 状态
   → domains/quick-actions/service-execution.ts 通过 provider 解析模板、拼装系统提示词并执行快捷操作
   → settings quick-actions 面板与 editor quick-actions 共用 domains/quick-actions/service-data.ts
   → domains/editor/service.ts 构建上下文、选择 provider、请求 AI 建议
   → providers/obsidian-api.ts 负责 Notice 与全局系统提示词读取
   → providers/event-bus.ts 发布 editor.tab-completion.* 事件（可供后续域订阅）

插件初始化或 skills 目录变化
   → core/FeatureCoordinator 调用 domains/skills/ui.ts 协调初始化与监听
   → domains/skills/service.ts 扫描 SKILL.md、解析 frontmatter、加载正文
   → providers/obsidian-api.ts 负责 Vault 目录读取、文件读取、YAML 解析与变更事件

chat consumer / component 读取共享类型、默认设置、Markdown 渲染或图片意图识别逻辑
   → src/types/chat.ts 与 legacy chat type/service shim 转发到 domains/chat
   → domains/chat/types.ts 提供稳定数据结构
   → domains/chat/config.ts 提供默认值与消息管理归一化
   → domains/chat/ui-markdown.ts 通过 ObsidianApiProvider 统一内部链接打开与 MarkdownRenderer
   → domains/chat/ui-view-coordinator.ts 通过 ChatConsumerHost 统一工作区 leaf 操作
   → domains/chat/service*.ts 提供 pinned 检测、图片意图识别、live plan prompt、
      历史解析、历史格式化、历史摘要、context compaction、provider 纯 helper、
      附件选择、状态存储与宿主端口契约

chat 在发送前组装 provider messages
   → core/chat/services/chat-service.ts 通过组合式 facade 委托 provider message slice
   → core/chat/services/chatProviderMessages.ts 保留 legacy facade，
      并承接 prompt/context adapter
   → domains/chat/service-context-compaction.ts 与 service-provider-message-*.ts
      负责 compaction、预算比较与 provider 纯辅助逻辑

chat 准备请求、发送消息或执行消息变更
   → core/chat/services/chat-service.ts 通过 message facades 委托 action slice
   → core/chat/services/chatMessageOperations.ts 保留 prepare/send helper
   → core/chat/services/chatMessageMutations.ts 保留 edit/delete/regenerate helper

chat 生成回复或为 compare/sub-agent 执行模型请求
   → core/chat/services/chat-service.ts 通过 generation facade 委托生成 slice
   → core/chat/services/chatGeneration.ts 保留流式生成、工具注入与错误包装
   → core/chat/services/chat-service.ts 只负责 generation deps builder 与 facade 组装

chat 构建 system prompt 或工具读取技能正文
   → core/chat/services/chat-service.ts 组装技能提示词块
   → tools/skill/skill-tools.ts 读取 domains/skills/service.ts 暴露的正文加载能力
   → domains/skills/service.ts 输出安全转义的 skills 片段与技能正文

插件启动或 settings 刷新 MCP 配置
   → core/FeatureCoordinator 调用 domains/mcp/ui.ts 协调外部 MCP 运行时
   → domains/mcp/service.ts 负责首次创建或后续更新外部 MCP runtime
    → domains/mcp/runtime/* 与 domains/mcp/transport/*
       承载 client/process/transport 内核
   → chat 与设置 UI 只消费统一的运行时接口与状态快照
```

## 事件注册表

| 事件名             | 发布者 | 订阅者 | 数据类型 |
| ------------------ | ------ | ------ | -------- |
| （随项目演进填充） |        |        |          |

## 架构分析：第一性原理

在做任何架构决策前，应先完成以下分析：

1. **理解本质**：该功能在 Obsidian 生态中的定位是什么？它解决用户的什么
   核心痛点？
2. **识别边界**：核心功能 vs 辅助功能的界限在哪里？哪些是 MVP，哪些是
   后续迭代？
3. **数据流分析**：数据从哪里来、经过哪些变换、最终到哪里去？事件流的
   触发链条是什么？
4. **最小依赖**：完成该功能所需的最少 Obsidian API 调用是什么？是否有更
   简单的实现路径？

架构文档和设计决策记录（ADR）应存放在 `docs/designs/` 和 `docs/decisions/`。
