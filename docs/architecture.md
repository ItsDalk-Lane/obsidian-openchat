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
├── domains/feature-a  → providers/obsidian-api, providers/settings
├── domains/feature-b  → providers/obsidian-api, providers/event-bus
└── domains/feature-c  → providers/obsidian-api, providers/settings,
                         providers/event-bus
```

## 数据流

（描述核心数据流向，每次架构变更时更新）

```text
用户操作 → Obsidian 事件 → domains/xxx/ui.ts 接收
  → 调用 domains/xxx/service.ts 处理
  → 通过 providers/obsidian-api.ts 读写 Vault
  → 如需通知其他域 → providers/event-bus.ts 发布事件
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
