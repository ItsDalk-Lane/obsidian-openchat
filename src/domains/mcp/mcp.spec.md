# mcp 行为规格

## 概述

mcp 域负责外部 MCP 服务器运行时的初始化、设置刷新、状态暴露与释放。

## 核心行为

### 行为 1：初始化外部 MCP 运行时

- 触发条件：插件启动或 settings 刷新时。
- 预期结果：首次创建外部 MCP 运行时，后续只更新 settings。
- 边界情况：
  - 当运行时创建失败时 → 允许后续 initialize 重试。

### 行为 2：向 chat 与设置 UI 暴露统一运行时接口

- 触发条件：FeatureCoordinator、ChatService 或设置面板读取 MCP 运行时。
- 预期结果：consumer 通过统一接口读取状态、工具列表和连接能力，而不是直接依赖 runtime 内核实现。
- 边界情况：
  - 当运行时尚未初始化时 → 返回 null，由上层决定是否延迟初始化。

### 行为 3：在域内完成 client/process/transport 运行时闭环

- 触发条件：运行时需要连接、重连、健康检查或调用工具时。
- 预期结果：domains/mcp 内部完成协议握手、工具刷新、健康检查和 transport 选择。
- 边界情况：
  - 远程 transport 短暂失败时 → 按重试与冷却策略恢复。
  - HTTP transport 需要 requestUrl 时 → 通过 provider 注入的 requestHttp() 执行。

### 行为 3.1：遵循明确的重试与重连策略

- 触发条件：tool call、remote SSE 或远程 transport 出现短暂失败时。
- 预期结果：
  - tool call 最多重试 2 次，延迟依次为 600ms、1500ms。
  - remote transport 仅在第 1 次失败时允许先重连后重试，避免无限重连。
  - remote SSE 断流后按递增退避重连，直到达到实现中的最大退避窗口。
- 边界情况：
  - 业务级错误（如 4xx/参数错误）→ 不作为可重试错误处理。
  - 超时、网络抖动、session reset 等暂时性错误 → 允许按策略恢复。

### 行为 4：释放外部 MCP 运行时

- 触发条件：插件卸载或 FeatureCoordinator dispose。
- 预期结果：调用运行时 dispose 并清空缓存引用。

## 不做什么（显式排除）

- 该域本轮不负责 MCP Markdown 配置持久化。
- 该域本轮不负责 MCP 设置编辑 Modal。
- 该域本轮不负责 chat tool loop 对 MCP 工具结果的适配。

## 依赖

- 依赖的其他域：无。chat 与 settings 只作为 consumer 使用统一运行时接口，不被 mcp 域直接导入。
- 依赖的 provider：通过 providers/providers.types.ts 注入 notify 与 requestHttp() 最小宿主能力

## 变更历史

| 日期 | 变更内容 | 原因 |
| --- | --- | --- |
| 2026-03-28 | 初始版本，迁移外部 MCP 运行时门面域 | 执行第四个样板域迁移 |
| 2026-03-28 | 更新为完整外部 MCP 运行时域，内收 client/process/transport 内核 | 完成第四个样板域闭环 |
