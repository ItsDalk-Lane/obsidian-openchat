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
   obsidian；只有 providers/obsidian-api.ts 是宿主 API 适配点
- provider 实现允许依赖稳定的共享工具模块（如 src/utils/AIPathManager），
   但不得反向依赖 domains、core、commands 或其他 provider 实现

### 渐进纳管范围

- 当前 lint-arch / lint-taste 先强制纳管 infra/、src/providers/、src/domains/
   与少量明确的 consumer 文件
- legacy 目录仍在迁移中；“当前仓库 managed files 满足规则”表示受管范围内零违规，
   不等于整个 src/ 已完成全量纳管
- 每迁完一个域或一个组合根，就把对应文件纳入 managed scope，避免一次性对全仓
   强推规则导致噪声淹没真实问题
- settings 域当前仍复用 `src/settings/ai-runtime` 与 `src/types/chat` 中的共享运行时类型，
   这是渐进迁移期的临时例外；待 chat/ai-runtime 类型源完成域化后，再回收到各自域或共享契约层
- chat 域当前已建立 `src/domains/chat/`，先承接共享类型、默认配置、图片意图识别、
   live plan prompt、历史解析、历史格式化、历史摘要、context compaction、
   provider message 纯 helper、文件意图分析、附件选择与 UI/状态纯辅助逻辑；
   会话运行时、历史持久化、多模型服务与 Chat 视图仍保留在 legacy `src/core/chat/`、
   `src/components/chat-components/` 与 `src/commands/chat/` 中，后续继续迁移

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
  it('所有 Obsidian API 调用通过 providers/obsidian-api.ts', () => { ... });
});
```

### 品味不变量 Linter（lint-taste.ts）

|规则|说明|错误信息中的修复指导|
|---|---|---|
|文件大小|单文件不超过 300 行|按子功能拆分到同一 domain 目录内|
|命名规范|文件名 kebab-case，类型 PascalCase，函数 camelCase|给出正确命名示例|
|结构化日志|禁止 console.log，使用项目日志工具|给出替代调用方式|
|无 any|禁止隐式或显式 any|建议使用 unknown + 类型守卫|
|无 barrel export|禁止 index.ts re-export|直接导入具体文件|
|副作用命名|有副作用的函数名必须含动词前缀（save/mutate/register/delete）|给出命名模板|

## 模块依赖图

（每次新增或删除域时更新此图）

```text
main.ts
├── domains/chat          → 共享 chat 契约 / 默认配置 / 纯 helper（phase 1）
├── domains/settings      → providers/obsidian-api, injected refresh/debug adapters
│   └── legacy adapter factories
│      → secret manager / migration / system-prompt / MCP markdown storage
├── core/FeatureCoordinator
│   ├── domains/skills  → providers/obsidian-api
│   └── domains/mcp     → providers/obsidian-api (notify, requestHttp)
├── core/chat/services    → domains/chat
│   └── types, config, pure helpers, history formatting,
│      history summary, context compaction, provider helpers,
│      attachment selection
├── core/chat/services/ChatService
│   └── 组合 provider/message/generation facades 与 deps builders
├── core/chat/services/ChatServiceOps
│   └── 统一承接 legacy public delegation，向外保持兼容 API
├── core/chat/services/ChatServiceCore
│   └── domains/skills   → buildSkillsSystemPromptBlock
├── commands/ai-runtime/AiRuntimeCommandManager
│   └── domains/editor  → providers/obsidian-api, providers/event-bus
└── 其他 legacy 区域      → 逐步迁移中，暂未纳入 domains/
```

## 数据流

（描述核心数据流向，每次架构变更时更新）

```text
插件启动或用户保存设置
   → main.ts 向 domains/settings/ui.ts 注入最小 refresh/debug 接口
   → domains/settings/ui.ts 合并部分更新并应用调试配置
   → domains/settings/service.ts 读取或写回 data.json，并委托迁移/系统提示词/MCP Markdown 适配器
   → providers/obsidian-api.ts 负责 AI 数据目录初始化
   → core/FeatureCoordinator 刷新 ai-runtime / chat / mcp 运行时

用户在编辑器中按触发键
   → commands/ai-runtime/AiRuntimeCommandManager 读取 aiRuntime 设置并组装 provider 适配器
   → domains/editor/ui.ts 接收键盘事件并维护 CodeMirror 状态
   → domains/editor/service.ts 构建上下文、选择 provider、请求 AI 建议
   → providers/obsidian-api.ts 负责 Notice 与全局系统提示词读取
   → providers/event-bus.ts 发布 editor.tab-completion.* 事件（可供后续域订阅）

插件初始化或 skills 目录变化
   → core/FeatureCoordinator 调用 domains/skills/ui.ts 协调初始化与监听
   → domains/skills/service.ts 扫描 SKILL.md、解析 frontmatter、加载正文
   → providers/obsidian-api.ts 负责 Vault 目录读取、文件读取、YAML 解析与变更事件

chat consumer 读取共享类型、默认设置或图片意图识别逻辑
   → src/types/chat.ts 与 legacy chat type/service shim 转发到 domains/chat
   → domains/chat/types.ts 提供稳定数据结构
   → domains/chat/config.ts 提供默认值与消息管理归一化
   → domains/chat/service*.ts 提供 pinned 检测、图片意图识别、live plan prompt、
      历史解析、历史格式化、历史摘要、context compaction、provider 纯 helper、
      附件选择、状态存储与宿主端口契约

chat 在发送前组装 provider messages
   → core/chat/services/ChatService.ts 通过组合式 facade 委托 provider message slice
   → core/chat/services/chatProviderMessages.ts 保留 legacy facade，
      并承接 prompt/context adapter
   → domains/chat/service-context-compaction.ts 与 service-provider-message-*.ts
      负责 compaction、预算比较与 provider 纯辅助逻辑

chat 准备请求、发送消息或执行消息变更
   → core/chat/services/ChatServiceOps.ts 通过 message facades 委托 action slice
   → core/chat/services/chatMessageOperations.ts 保留 prepare/send helper
   → core/chat/services/chatMessageMutations.ts 保留 edit/delete/regenerate helper

chat 生成回复或为 compare/sub-agent 执行模型请求
   → core/chat/services/ChatServiceOps.ts 通过 generation facade 委托生成 slice
   → core/chat/services/chatGeneration.ts 保留流式生成、工具注入与错误包装
   → core/chat/services/ChatService.ts 只负责 generation deps builder 与 facade 组装

chat 构建 system prompt 或工具读取技能正文
   → core/chat/services/ChatServiceCore.ts 组装技能提示词块
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
