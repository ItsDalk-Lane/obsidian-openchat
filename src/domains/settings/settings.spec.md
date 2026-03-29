# settings 行为规格

## 概述

settings 域负责插件设置的默认值、加载、保存、旧数据迁移，以及设置生命周期与
外部协调器之间的连接。`AiRuntimeSettings` 的真实类型与默认/归一化逻辑
现已位于 settings 域内部；legacy `src/settings/ai-runtime/core.ts` /
`api.ts` / `settings.ts` 仅保留兼容 shim。

## 核心行为

### 行为 1：加载并规范化插件设置

- 触发条件：插件启动时读取 data.json。
- 预期结果：返回完整的 PluginSettings，补齐默认值，解密 API 密钥，加载 Markdown MCP 服务器，并清理运行时不应保留的旧字段。
- 边界情况：
  - 当 data.json 缺失或字段不完整时 → 回退到默认值。
  - 当旧版默认系统消息迁移失败时 → 记录日志并继续加载。
  - 当 Markdown MCP 服务器加载失败时 → 回退为空列表。

### 行为 2：保存并刷新运行时设置

- 触发条件：用户修改设置或代码路径调用 replace/save。
- 预期结果：持久化设置、同步外部 Markdown MCP 服务器存储、刷新 FeatureCoordinator。
- 边界情况：
  - 运行时字段不应写回 data.json。
  - 旧版顶层字段和 legacy MCP 字段必须在写回前剥离。
  - 当 MCP Markdown 同步失败时 → 记录日志，并继续保存其余设置。

### 行为 3：执行设置相关迁移与目录初始化

- 触发条件：延迟初始化阶段或用户修改 AI 数据目录。
- 预期结果：清理旧版数据位点、迁移 AI 数据目录并确保目标目录存在。
- 边界情况：
  - 目录初始化失败时 → 记录日志，不阻断整个插件启动。
  - 数据迁移失败时 → 允许后续功能继续重试。

## 不做什么（显式排除）

- 该域不负责 chat 专属设置面板状态管理。
- 该域不负责 MCP 运行时本体，只负责 settings 生命周期中的配置装配。
- 该域不直接渲染复杂 React 设置 UI，设置页仍作为外层薄壳使用。

## 依赖

- 依赖的 Provider：无（所有外部能力通过端口契约注入）
- 域内真源：
  - `types-ai-runtime.ts`：AiRuntimeSettings / ToolExecutionSettings / EditorStatus
  - `config-ai-runtime.ts`：ai-runtime 默认值、clone、normalize、tool execution sync
  - `config-ai-runtime-vendors.ts`：vendor registry / APP_FOLDER
- 跨域共享契约：
  - `src/types/chat.ts`：纯 shim 共享 `DEFAULT_CHAT_SETTINGS` 与 `ChatSettings`
- 端口契约（由 core/settings-adapter-assembly.ts 装配）：
  - `SettingsPersistencePort`：loadData / saveData
  - `SettingsHostPort`：ensureAiDataFolders
  - `SettingsSecretPort`：decryptAiRuntimeSettings / encryptAiRuntimeSettings
  - `SettingsMigrationPort`：resolvePersistedAiRuntime / resolveAiDataFolder / normalizeLegacyFolderPath / migrateAIDataStorage / cleanupLegacyAIStorage
  - `SettingsSystemPromptPort`：migrateFromLegacyDefaultSystemMessage
  - `SettingsMcpServerPort`：loadServers / syncServers

## 用户可见文案

| 场景 | 中文 | English |
| --- | --- | --- |
| AI 数据目录初始化失败 | AI 数据文件夹初始化失败 | AI data folder initialization failed |
| AI 数据目录迁移失败 | AI 数据目录迁移失败 | AI data folder migration failed |

## 变更历史

| 日期 | 变更内容 | 原因 |
| --- | --- | --- |
| 2026-03-29 | `settings.ts` 也已降级为纯 shim，仓库内部 ai-runtime 消费方改为直连 domains/settings 真源 | 关闭 P1 残余：让 shim 状态与仓库真相完全一致 |
| 2026-03-29 | AiRuntimeSettings 真源迁入 settings 域，legacy ai-runtime 路径降级为纯 shim | 关闭 P1：让架构文档重新与代码一致 |
| 2026-03-29 | 端口化重构：移除所有 legacy 直接导入和 app/plugin 引用，改为 6 个显式端口契约 | P1 耦合修复：SettingsDomainService 不再依赖 ObsidianApiProvider 和 legacy 模块 |
| 2026-03-28 | 初始版本，迁移 settings 生命周期域 | 执行第三个样板域迁移 |
