# 重构分析报告

## 范围说明

本报告只分析 src/ 运行时代码。
scripts/、构建配置与发布产物不在本次范围内。

## 顶层区域盘点

### src/main.ts

- 当前职责：插件入口、同步注册、bootstrap settings 触发、延迟启动。
- 主要问题：仍直接持有多个协调器与设置控制器，chat 与 settings 的组合根尚未彻底缩小。
- 迁移建议：保持为组合根，只负责注册和依赖注入；耗时 hydrate 继续留在 `onLayoutReady` 后执行。

### src/core/

- 当前职责：跨功能协调、聊天运行时、基础服务。
- 主要问题：chat 相关体量最大，虽然继承链已拆平为 facade + support 文件，但跨层耦合仍重。
- 迁移建议：后续拆为 domains/chat 与少量基础设施。
- 当前状态：`FeatureCoordinator` 已开始承担 chat host adapter 组合根，`createChatServiceDeps()` 不再接收 `OpenChatPlugin`。

### src/commands/

- 当前职责：命令与编辑器扩展接入。
- 主要问题：作为 legacy 接入壳，仍直接桥接多处旧模块。
- 迁移建议：逐步收敛为只消费 domains 与 providers。

### src/editor/

- 当前职责：编辑器增强、工具栏、tab completion。
- 主要问题：同时包含 UI、状态、数据服务与 provider 桥接。
- 迁移建议：拆为 domains/editor 与 domains/quick-actions。
- 当前状态：`ChatEditorIntegration*` 已改为接收最小 host adapter，不再直接依赖 `OpenChatPlugin`。

### src/settings/

- 当前职责：设置存储、迁移、设置页。
- 主要问题：持久化、UI、默认值与兼容逻辑杂糅。
- 迁移建议：拆为 domains/settings 与 provider 读写接口。
- 当前状态：settings 生命周期已迁入 domains/settings，启动链路已拆为 bootstrap + hydrate；迁移/secret/MCP Markdown 持久化仍保留 legacy 接缝。

### src/services/skills

- 当前职责：skills 扫描、监听、运行时协调。
- 主要问题：结构较清晰，但仍通过 barrel export 暴露。
- 迁移建议：适合作为第二批迁移域。

### src/services/mcp

- 当前职责：遗留 MCP 客户端、配置、工具执行、transport 与设置 UI 支撑。
- 主要问题：体量大、接缝多、对 chat 与 settings 影响广。
- 迁移建议：runtime core 已迁入 domains/mcp，配置 UI、Markdown 持久化与 tool loop 适配继续保留 legacy。

### src/tools/

- 当前职责：工具定义、运行时计划、子代理。
- 主要问题：目录内聚度一般，横跨 runtime 与具体工具。
- 迁移建议：后续按 runtime 与 tool-catalog 拆分。

### src/components/

- 当前职责：React / Obsidian UI 组件。
- 主要问题：通用组件与业务组件混杂。
- 迁移建议：保持 UI 库定位，业务组件逐步回归域内。

### src/LLMProviders/

- 当前职责：各模型 vendor 适配器。
- 主要问题：兼容层多、实现差异大。
- 迁移建议：暂保留 legacy，先在命令层做桥接适配。

## 未来域映射建议

### domains/editor

- 当前来源：src/editor/tabCompletion。
- 后续来源：src/editor/selectionToolbar。
- 说明：与编辑器行为强相关，边界相对清晰。
- 优先级：P0。

### domains/skills

- 当前来源：src/services/skills。
- 说明：已具备 scanner / watcher / coordinator 结构。
- 优先级：P1。

### domains/settings

- 当前来源：src/settings。
- 说明：需要先完成 provider 读写接缝。
- 优先级：P1。

### domains/mcp

- 当前来源：src/services/mcp（外部 runtime core、共享类型）与 src/types/mcp。
- 说明：外部 MCP runtime 已整体迁入 domains/mcp，并在域内完成 runtime/process/client/transport 闭环；legacy 仅保留配置 UI、Markdown 持久化与 tool loop 适配。
- 优先级：P2。

### domains/chat

- 当前来源：src/core/chat、src/commands/chat 与相关组件。
- 说明：当前最复杂，适合最后迁移。
- 优先级：P3。

## 当前依赖与耦合热点

### 旧的 tabCompletion 实现混合四类职责

- 旧的 TabCompletionService 同时承担设置默认值、上下文构建、
  AI 请求、Notice 提示和连续使用状态。
- 旧的 TabCompletionExtension 既负责 CodeMirror UI 事件，
  又持有全局 window 单例式状态。
- 这类结构虽然集中，但边界不清晰，后续很容易继续堆职责。

### 命令层承担过多桥接逻辑

- AiRuntimeCommandManager 既是命令注册点，
  又负责 editor extension 生命周期、settings 适配和 provider 同步。
- 迁移后该文件仍保留桥接职责，但目标是只做运行时组装。

### chat 主域仍是最大技术债

- src/core/chat 仍是代码库里耦合最重的区域。
- 它同时依赖 provider、MCP、skills、工具执行和 UI 多边交互。
- 若在 provider 和 lint 护栏未稳定前直接迁移 chat，
  风险会远大于收益。

### barrel export 仍广泛存在

- src/services/skills/index.ts、src/tools/sub-agents/index.ts、
  src/tools/runtime/index.ts 等目录仍依赖聚合导出。
- 这会模糊真实依赖方向，也是后续 lint-taste 的重点治理对象。
- 当前已开始在 touched path 上把 folder import 改成具体文件导入；
  `src/tools/sub-agents/index.ts` 与 `src/editor/chat/index.ts` 已移除，但全仓尚未清零。

## 问题清单

- 过深抽象
  - 现状：chat 服务链路与 provider 层存在多段桥接。
  - 风险：高。
  - 处理策略：先迁简单域，后用 providers 削平接缝。
- 隐式依赖
  - 现状：旧 tabCompletion 通过 window 保存服务实例。
  - 风险：中。
  - 处理策略：已在首个域迁移中移除，改为控制器闭包状态。
- 模糊命名
  - 现状：部分 legacy 目录存在 index.ts 与聚合入口。
  - 风险：中。
  - 处理策略：用 taste linter 渐进纳管。
- 巨型文件
  - 现状：chat、settings、provider 相关文件仍偏大。
  - 风险：高。
  - 处理策略：后续按域拆分。
- 隐式全局状态
  - 现状：plugin、app、settings 被多处直接透传。
  - 风险：中。
  - 处理策略：用 providers 与 command adapter 缩短传递链。

## 为什么首个迁移域选择 editor/tabCompletion

1. 影响面可控。
   外部直接消费方集中在 AiRuntimeCommandManager。
2. 业务边界明确。
   功能就是编辑器补全，有清晰的输入、状态和输出。
3. 可以快速验证新架构。
   它同时覆盖 service、ui、provider 和命令层适配。
4. 能直接暴露问题。
   旧实现里最典型的混合职责、直接依赖和隐式状态都在这里。

## 推荐迁移顺序

1. domains/editor：已完成，验证新架构与 provider 接缝。
2. domains/skills：已完成，形成 scanner / runtime 样板。
3. domains/settings：已完成，设置生命周期迁入 domains。
4. domains/mcp：已完成，外部 MCP 运行时完整迁入 domains，legacy 只保留明确接缝。
5. domains/chat：最后处理主复杂域。

## 当前阶段结论

- 阶段一步骤 2 的最小可交付版本，
  已可以只硬性检查 infra/、src/providers/、src/domains/
  和新域消费者，不必一开始就覆盖整个 legacy 仓库。
- 阶段一步骤 3 的 provider 边界，
  当前以 Notice、system prompt、settings 读写和 event bus 为主，
  足以支撑首个 editor 域迁移。
- 阶段三的首个域迁移应以“建立样板”为主。
  本次迁移已经把 tabCompletion 核心行为迁入 src/domains/editor/，
  后续再扩展 editor 其它能力。
- 第二与第三个样板域已经完成：
  src/domains/skills/ 承接 skills 扫描与运行时协调，
  src/domains/settings/ 承接 settings 生命周期。
- 第四个样板域已完成：
  src/domains/mcp/ 承接外部 MCP 运行时完整闭环，
  域内覆盖 service/runtime/process/transport 测试与行为规格，
  legacy src/services/mcp/ 只保留配置 UI、Markdown 持久化与 tool loop 适配。
- settings 启动编排已完成第一轮收口：
  `main.ts` 不再 await 完整 settings load，
  `domains/settings/service.ts` 改为 bootstrap + deferred hydrate 两段式接口，
  便于后续继续压缩 `onload()` 阻塞路径。
- chat 宿主边界已完成第一轮收口：
  `ChatFeatureManager`、`ChatViewCoordinator`、`ChatEditorIntegration`
  不再接收 `OpenChatPlugin`，
  它们只消费 `FeatureCoordinator` 创建的最小 host adapter。
