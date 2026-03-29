# ADR 0002: AiRuntime 归属 settings 域，quick-actions 以 Result 建模可预期错误

## 状态

已接受

## 背景

此前仓库存在两处架构漂移：

- `docs/architecture.md` 把 `src/settings/ai-runtime` 与 `src/types/chat.ts`
  一起描述为“迁移期 shim，只做转发”。
  但真实代码中，`src/settings/ai-runtime/core.ts` 仍承载
  `AiRuntimeSettings`、默认值、归一化、tool execution 同步与 clone 逻辑。
- 架构文档要求 Service 层对可预期错误优先使用 Result 模式，
  但 `src/domains/quick-actions/service-data.ts` 与
  `src/domains/quick-actions/service-execution.ts` 仍大量使用
  `throw new Error(...)` 表达业务校验失败。

这使得“文档真相”和“代码真相”长期不一致，也削弱了 AI 会话继续开发时的边界稳定性。

## 决策

- 将 ai-runtime 的真实所有权收回 settings 域：
  - 类型定义迁入 `src/domains/settings/types-ai-runtime.ts`
  - 默认值、归一化、clone 与 tool execution 同步逻辑迁入
    `src/domains/settings/config-ai-runtime.ts`
  - vendor registry / `APP_FOLDER` 迁入
    `src/domains/settings/config-ai-runtime-vendors.ts`
  - `src/settings/ai-runtime/core.ts`、`api.ts`、`settings.ts`
    降级为纯兼容 shim
- 明确区分 legacy 目录中的两类文件：
  - 纯 shim：仅 import/export/type alias，可被 lint 按 shim 语义约束
  - legacy 真实实现：允许暂存尚未域化的逻辑，但不得冒充 shim
- 在 quick-actions 域内引入轻量 Result 建模：
  - `QuickActionDataError`、`QuickActionExecutionError`
  - `QuickActionResult<T, E>`
  - `QuickActionCompatibilityError`
- `service-data.ts` 与 `service-execution.ts` 的核心流程优先返回 Result；
  为保持既有 editor/settings consumer 行为，
  原有 public API 继续提供兼容包装层，把结构化错误恢复为旧的返回值或异常语义
- 仓库内部生产代码统一改为直接引用 domains 真源：
  - ai-runtime 消费方不再经由 `src/settings/ai-runtime/*`
  - chat 共享类型/默认值/helper 不再经由 `src/types/chat.ts`
- 对于 `settings` / `quick-actions` 这类无法跨域直连 `chat` 的域文件，
  保留通过 `src/types/chat.ts` 这个纯 shim 共享契约；
  这不是 legacy 真实实现残留，而是当前架构护栏下的显式边界选择
- quick-actions 的 settings/editor 主路径直接消费 Result-first 入口；
  兼容异常仅保留给 legacy public API

## 后果

### 正向

- `docs/architecture.md` 可以再次准确描述 shim 与真实实现的边界
- settings 域真正拥有自己的 ai-runtime 结构，不再依赖 legacy 核心逻辑
- quick-actions 的可预期错误语义可测试、可枚举、可在 future consumer 中直接复用
- 兼容包装层让现有 UI、Notice、调用方式保持稳定
- `src/settings/ai-runtime/*` 在仓库内部已不再承载生产路径依赖；
  `src/types/chat.ts` 仅保留给兼容测试与少量跨域域文件共享契约

### 代价

- quick-actions Service 层需要同时维护 Result-first 核心流程与兼容 public API
- 需要同时维护 domains 真源与 shim/兼容入口的测试，防止未来回流业务逻辑
