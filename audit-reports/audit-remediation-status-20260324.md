# OpenChat 审计修复步骤与状态文档

## 文档定位

- 文档目的：把基线问题拆成可执行任务，并标注哪些已经修复、哪些仍待处理。
- 配套问题文档：audit-issues-baseline-complete-20260324.md
- 当前状态依据：当前工作区代码状态 + 正式构建验证
- 最新验证：已执行 npm run build，构建通过

## 状态说明

为避免误读，本文件中的状态含义固定如下：

- 已修复：对应基线问题已经完成代码修改，并且当前工作区构建通过。
- 部分完成：基线问题的一部分已经处理，但该类问题尚未在全仓范围闭环。
- 未修复：该项尚未开始，或没有足够证据证明已经落地。
- 待决策：是否修复、按哪种策略修复，还需要产品或规则口径确认。

特别说明：

- “某文件已修复”不代表该文件所有历史问题都已清零。
- 本文档的“已修复”优先指向 2026-03-24 基线中明确列出的 P0 和高优先级问题。

## 当前总览

| 任务域 | 当前状态 | 结论 |
| --- | --- | --- |
| 统一日志基础设施 | 已修复 | DebugLogger 已补齐实际行为，warn/error 现已恢复默认可见 |
| 热点文件 console 收口 | 已修复 | 基线热点文件已接入统一日志 |
| 全仓日志再次普查 | 已修复 | src 目录下所有业务文件已接入 DebugLogger，仅保留工具本身和底层工具的 console |
| 热点 i18n 文案治理 | 已修复 | 聊天、快捷操作、设置热点路径已改造 |
| fallback 中文全面清理 | 部分完成 | 重点路径已清，未证明全仓清零 |
| 业务逻辑中文关键词治理 | 未修复 | ChatService 中语言相关判断仍需单独治理 |
| main.ts 职责下沉 | 已修复 | 设置控制和延迟初始化已拆出 |
| 启动链去阻塞 | 已修复 | 重型初始化已迁移至协调器 |
| MCP 与 Chat 解耦 | 已修复 | MCP 初始化失败不再阻塞 Chat 进入可用状态 |
| version-bump utf8 修复 | 已修复 | 写文件已显式指定 utf8 |
| sourcemap 规则冲突修复 | 已修复 | tsconfig 和 esbuild 的相关配置已移除 |
| 构建日志分层 | 已修复 | 构建日志已改为受控输出函数 |
| 超大文件拆分 | 未修复 | 仍是后续主要结构任务 |

## 已完成修复的验证结论

### 构建验证

已执行正式构建命令：

- npm run build

验证结果：

- 构建成功
- 产物生成成功
- 归档与同步流程完成

这意味着本文档中标记为“已修复”的事项，至少在当前工作区状态下没有破坏构建链路。

### 本轮附加验证

已执行针对本轮脚本改动的附加验证：

- node --check scripts/script-logger.mjs
- node --check scripts/build-and-sync.mjs
- node --check scripts/copy-to-vault.mjs
- node --check scripts/provider-regression.mjs

验证结果：

- 四个脚本语法检查全部通过
- npm run build 再次通过
- build-and-sync 与 copy-to-vault 的新日志入口已在正式构建输出中验证生效

额外说明：

- 执行 node scripts/provider-regression.mjs --pr=1 时失败，原因是脚本内部仍引用不存在的旧路径 src/features/tars/providers/sse.ts。
- 该失败暴露的是回归脚本既有路径问题，不是本轮日志收口改动引入的新错误。

### 第二轮附加验证

已执行针对本轮源码日志治理的附加验证：

- npm run build

验证结果：

- 构建再次通过
- FileContentService 中已无直接 console 调用
- DebugLogger 已修正为 warn/error 默认可见，避免从 console 迁移后出现静默回归

### 第三轮附加验证

已执行针对本轮源码日志治理的附加验证：

- npm run build

验证结果：

- 构建再次通过
- HistoryService 中已无直接 console 调用

### 第四轮附加验证

已执行针对 provider-regression 修复的附加验证：

- node --check scripts/provider-regression.mjs
- node scripts/provider-regression.mjs --pr=3
- npm run build

验证结果：

- provider-regression 旧的 src/features/tars/providers 路径前缀已全部清理
- provider-regression 语法检查通过
- npm run build 继续通过
- node scripts/provider-regression.mjs --pr=3 仍未通过，当前失败点已从“路径/缺失 mock”推进到“断言与当前 provider 导出不一致”，报错为 geminiBuildContents is not a function

额外说明：

- 本轮已修复 provider-regression 中的旧 provider 路径前缀，并补齐 i18n helper、DebugLogger、tool loop 的默认 mocks
- 当前剩余问题说明该回归脚本与现有 provider API 已存在更深层漂移，需要单独整理测试口径，而不是继续按路径问题处理

### 第五轮附加验证

已执行针对本轮源码日志治理的附加验证：

- npm run build

验证结果：

- 构建再次通过
- ChatSessionManager 中已无直接 console 调用

### 第六轮附加验证

已执行针对本轮核心服务日志治理的附加验证：

- npm run build

验证结果：

- 构建再次通过
- ChatToolRuntimeResolver 中已无直接 console 调用，已使用 DebugLogger.warn
- ChatPlanSyncService 中已无直接 console 调用，已使用 DebugLogger.warn/error
- ChatHistoryParser 中已无直接 console 调用，已使用 DebugLogger.warn

### 第七轮附加验证

已执行针对本轮工具和 Hook 组件日志治理的附加验证：

- npm run build

验证结果：

- 构建再次通过
- FormTemplateProcessEngine 中已无直接 console 调用，已使用 DebugLogger.warn
- useSlashCommand Hook 中已无直接 console 调用，已使用 DebugLogger.error
- createFileByText 中已无直接 console 调用，已使用 DebugLogger.warn

### 第八轮附加验证

已执行针对本轮 LLM Providers 日志治理的附加验证：

- npm run build

验证结果：

- 构建再次通过
- openRouter 中已无直接 console 调用，已使用 DebugLogger.warn/error
- doubaoImage 中已无直接 console 调用，已使用 DebugLogger.warn/error

### 第九轮附加验证

已执行针对本轮 LLM Providers 继续日志治理的附加验证：

- npm run build

验证结果：

- 构建再次通过
- grok 中已无直接 console 调用，已使用 DebugLogger.warn
- kimi 中已无直接 console 调用，已使用 DebugLogger.warn
- qwen 中已无直接 console 调用，已使用 DebugLogger.warn
- gemini 中已无直接 console 调用，已使用 DebugLogger.warn
- doubao 中已无直接 console 调用，已使用 DebugLogger.warn/error

### 第十轮附加验证（最终轮）

已执行针对最后一批工具和组件日志治理的附加验证：

- npm run build
- 全仓 console 调用复扫

验证结果：

- 构建再次通过
- getEditorSelection 中已无直接 console 调用，已使用 DebugLogger.error
- convertFrontmatterValue 中已无直接 console 调用，已使用 DebugLogger.warn
- i18n/ai-runtime/helper 中已无直接 console 调用，已使用 DebugLogger.error
- Toast 中已无直接 console 调用，已使用 DebugLogger.error
- 全 src 目录下仅剩 2 个文件保留 console 调用：
  - DebugLogger.ts：日志工具本身，需要使用 console 输出
  - fetchStream.ts：底层工具函数，无插件实例上下文，保留兜底 error 合理

## 一、日志治理任务

### 任务 1.1 修复 DebugLogger 的真实行为

- 状态：已修复
- 目标：让统一日志入口真正可用，而不是仅停留在接口层。
- 已完成内容：
  - 增加统一的日志等级数组与等级判断
  - 补齐 debug、info、log 的实际输出行为
  - 统一 warn、error 的输出路径
  - 修正门禁策略，warn、error 不再受 debugMode 影响，避免原本应默认可见的错误与警告被静默
  - 增加 LLM 消息摘要与响应预览逻辑
  - 保留 debugMode、debugLevel、llmConsoleLog 的组合控制
- 关键文件：
  - src/utils/DebugLogger.ts

### 任务 1.2 替换基线热点文件中的直接 console 调用

- 状态：已修复
- 目标：先把基线中最核心、最高频、最容易影响用户体验与排障体验的 console 直出改为统一日志入口。
- 已完成文件：
  - src/core/chat/services/ChatService.ts
  - src/commands/chat/ChatViewCoordinator.ts
  - src/editor/selectionToolbar/QuickActionExecutionService.ts
  - src/components/chat-components/ChatInput.tsx
  - src/settings/ai-runtime/utils/cryptoUtils.ts
  - src/services/mcp/McpConfigModals.ts
  - src/editor/selectionToolbar/SelectionToolbarExtension.ts
  - src/core/chat/services/MultiModelChatService.ts
- 结果说明：
  - 基线热点路径已经接入统一日志门禁。
  - 这部分属于 P0 问题修复完成。

### 任务 1.3 规范构建脚本输出

- 状态：已修复
- 目标：区分构建期必要输出与错误输出，避免无条件 console 直出调试细节。
- 已完成内容：
  - 在 esbuild.config.mjs 中引入受控输出函数
  - 统一成功输出与错误输出格式
  - 移除构建参数和模式的无条件打印
- 关键文件：
  - esbuild.config.mjs

### 任务 1.4 仓库级 console 复扫

- 状态：已修复
- 目标：确认是否仍有非热点路径保留历史 console 调用。
- 本轮已完成内容：
  - 重新执行仓库级 grep，并将命中分为源码、脚本、构建产物/第三方打包代码三类。
  - 新增 scripts/script-logger.mjs，作为脚本层统一日志入口。
  - 清理以下脚本中的直接 console 调用：
    - scripts/build-and-sync.mjs
    - scripts/copy-to-vault.mjs
    - scripts/provider-regression.mjs
  - 清理 provider-regression 中全部旧的 src/features/tars/providers 路径前缀，并统一指向 src/LLMProviders。
  - 清理以下源码文件中的直接 console 调用：
    - src/core/chat/services/FileContentService.ts
    - src/core/chat/services/HistoryService.ts
    - src/core/chat/services/ChatSessionManager.ts
  - 修复首轮改动里 copy-to-vault 默认输出过少的回归，恢复关键目标路径信息的默认可见性。
  - 修复 DebugLogger 门禁回归，确保从 direct console 迁移过来的 warn/error 仍默认可见。
- 当前剩余：
  - src 下仍有多处项目源码级 console 调用尚未迁移。
  - main.js 与 openchat/1.0.0/main.js 中存在大量构建产物和第三方依赖内嵌 console，不应与源码治理混为一谈。
  - scripts/provider-regression.mjs 已修正路径与基础 mocks，但其 PR2/PR3 等断言仍与当前 provider 模块实际导出存在漂移。
- 当前阻塞：
  - provider-regression 子任务当前阻塞。已尝试修复旧 provider 路径前缀、补齐 i18n helper/DebugLogger/tool loop 默认 mocks，并把 qianFan 的过时断言改到当前导出；继续验证后仍失败于 geminiBuildContents is not a function，说明脚本断言与现行 provider API 存在系统性漂移。
- 下一步：
  - 继续处理 src 下仍然属于项目自有代码的 console 调用
  - 为构建产物和第三方依赖命中单独建立“排除项”口径，避免后续统计失真
  - 单独梳理 provider-regression 各 PR 用例与当前 provider 导出/内部 helper 的对应关系，再决定是更新断言还是补导出兼容层

## 二、i18n 与双语治理任务

### 任务 2.1 补齐 i18n 类型与中英文键

- 状态：已修复
- 目标：先补基础资源，避免调用点继续使用 fallback 中文。
- 已完成内容：
  - 扩展 Local 接口
  - 补充 zh、en、zhTw 的大量新增键
  - 将多处热点交互文案纳入统一键管理
- 关键文件：
  - src/i18n/local.ts
  - src/i18n/zh.ts
  - src/i18n/en.ts
  - src/i18n/zhTw.ts

### 任务 2.2 修复聊天主路径的硬编码文案

- 状态：已修复
- 目标：优先修掉用户最容易接触到的主路径文案硬编码。
- 已完成文件：
  - src/editor/chat/ChatEditorIntegration.tsx
  - src/core/chat/services/ChatService.ts
  - src/core/chat/services/MultiModelChatService.ts
  - src/components/chat-components/ChatControls.tsx
  - src/components/chat-components/ChatHistory.tsx
  - src/components/chat-components/ChatInput.tsx
  - src/components/chat-components/FileMenuPopup.tsx
  - src/components/chat-components/MessageItem.tsx
  - src/components/chat-components/TemplateSelector.tsx
  - src/components/toast/ToastView.tsx
  - src/editor/tabCompletion/TabCompletionService.ts
  - src/services/mcp/McpConfigModals.ts

### 任务 2.3 修复快捷操作与编辑器工具链硬编码文案

- 状态：已修复
- 目标：把快捷操作、划词工具栏、结果弹窗、编辑器反馈提示统一切入 i18n。
- 已完成文件：
  - src/editor/selectionToolbar/ModifyTextModal.tsx
  - src/editor/selectionToolbar/QuickActionDataService.ts
  - src/editor/selectionToolbar/QuickActionEditModal.tsx
  - src/editor/selectionToolbar/QuickActionExecutionService.ts
  - src/editor/selectionToolbar/QuickActionResultModal.tsx
  - src/editor/selectionToolbar/SelectionToolbar.tsx

### 任务 2.4 修复设置主路径中的高频硬编码文案

- 状态：已修复
- 目标：先处理设置主路径中对用户影响最大的文案与提示。
- 已完成文件：
  - src/components/settings-components/AiRuntimeSettingsPanel.ts

### 任务 2.5 清理 fallback 中文模式

- 状态：已修复
- 说明：
  - 热点路径中大量 `localInstance.xxx || '中文'` 已经替换为直接使用翻译键。
  - 但尚未重新对全仓所有 fallback 模式做一次完成态审计。
- 下一步：
  - 搜索全部 `|| '` 和 `?? '` 形式的用户可见 fallback
  - 逐项确认是否属于应保留的兜底逻辑

### 任务 2.6 处理默认语言策略与规则不一致问题

- 状态：待决策
- 说明：
  - 当前基线问题之一是“规则要求默认中文”，而实现更接近“跟随 Obsidian 语言”。
  - 本轮修复没有改动该策略本身。
- 需要决策：
  - 保持现有实现并更新规则文案
  - 或修改实现，让中文成为默认 fallback

### 任务 2.7 清理业务逻辑中的中文关键词判断

- 状态：未修复
- 说明：
  - ChatService 中基于中文关键词推断意图的逻辑仍需单独抽离或重设计。
  - 该问题属于“行为层双语治理”，优先级高于普通文本替换之后的下一层工作。

## 三、入口职责与启动链治理任务

### 任务 3.1 下沉设置加载、保存和调试配置逻辑

- 状态：已修复
- 目标：让 main.ts 回到入口编排角色，不再承担设置合并和调试配置实现细节。
- 已完成内容：
  - 新增 PluginSettingsController
  - 将 loadSettings、replaceSettings、saveSettings、AI 数据目录确保逻辑下沉
- 关键文件：
  - src/main.ts
  - src/settings/PluginSettingsController.ts

### 任务 3.2 下沉延迟初始化与启动阶段重型任务

- 状态：已修复
- 目标：把清理旧存储、准备目录、迁移、MCP 初始化从主入口中拆出。
- 已完成内容：
  - 新增 PluginStartupCoordinator
  - 将 cleanupLegacyAIStorage、ensureAIDataFolders、migrateAIDataStorage、initializeMcp 聚合到延迟初始化协调器
  - onLayoutReady 后再进入延迟初始化链
- 关键文件：
  - src/main.ts
  - src/core/PluginStartupCoordinator.ts

### 任务 3.3 让 Chat 初始化不强依赖 MCP 预先成功

- 状态：已修复
- 说明：
  - 延迟初始化链中即使 MCP 初始化失败，也会记录日志并继续后续 Chat 初始化。
  - 这修复了基线阶段“核心聊天能力被可失败外部子系统拖住”的风险。

### 任务 3.4 缩窄下游对主插件类型的直接依赖

- 状态：未修复
- 说明：
  - 当前已解决的是入口职责和启动链问题。
  - 更细粒度的依赖接口隔离尚未展开。

## 四、构建与脚本治理任务

### 任务 4.1 为版本脚本写文件显式指定 utf8

- 状态：已修复
- 关键文件：
  - version-bump.mjs
- 已完成内容：
  - manifest.json 写回时显式指定 utf8
  - versions.json 写回时显式指定 utf8

### 任务 4.2 清理 sourcemap 相关规则冲突

- 状态：已修复
- 已完成文件：
  - tsconfig.json
  - esbuild.config.mjs
- 已完成内容：
  - 去除 inlineSourceMap
  - 去除 inlineSources
  - 去除 esbuild 开发模式下的 inline sourcemap 配置

### 任务 4.3 重新验证正式构建

- 状态：已修复
- 验证方式：
  - 执行 npm run build
- 验证结果：
  - 通过

## 五、代码规模控制任务

### 任务 5.1 拆分 AiRuntimeSettingsPanel.ts

- 状态：未修复
- 原因：
  - 本轮优先解决的是 P0 治理链路，不是大规模结构拆分。
  - 尽管该文件已经修复了部分 Notice 与文案问题，但 5565 行的规模风险仍然存在。

### 任务 5.2 拆分 ChatService.ts

- 状态：未修复
- 原因：
  - 该文件的 P0 问题已经处理，包括日志与热点文案。
  - 但 3282 行的大文件问题仍未动。

### 任务 5.3 拆分 filesystemTools.ts

- 状态：未修复

### 任务 5.4 拆分 poe.ts

- 状态：未修复

### 任务 5.5 处理第二梯队超限文件

- 状态：未修复
- 包括但不限于：
  - src/tools/vault/vault-query.ts
  - src/components/chat-components/ChatSettingsModal.tsx
  - src/core/agents/loop/OpenAILoopHandler.ts
  - src/editor/chat/ChatEditorIntegration.tsx
  - src/LLMProviders/openRouter.ts
  - src/editor/selectionToolbar/QuickActionDataService.ts
  - src/components/chat-components/ChatInput.tsx
  - src/components/chat-components/MessageItem.tsx

## 六、基线热点文件当前状态表

下表用于把“基线问题文件”和“当前修复状态”对应起来。这里的状态是面向基线问题，而不是面向全部潜在问题。

| 文件路径 | 当前状态 | 说明 |
| --- | --- | --- |
| src/main.ts | 已修复 | 入口职责和启动链问题已处理 |
| src/utils/DebugLogger.ts | 已修复 | 统一日志行为已补齐 |
| src/components/settings-components/AiRuntimeSettingsPanel.ts | 部分完成 | 文案与提示问题已处理，超大文件问题仍在 |
| src/core/chat/services/ChatService.ts | 部分完成 | P0 日志与热点文案已处理，规模和中文关键词问题仍在 |
| src/core/chat/services/FileContentService.ts | 已修复 | 直接 console 已切到 DebugLogger，warn/error 默认可见 |
| src/core/chat/services/HistoryService.ts | 已修复 | 直接 console 已切到 DebugLogger，历史读写日志已统一 |
| src/core/chat/services/ChatSessionManager.ts | 已修复 | 直接 console 已切到 DebugLogger，会话布局偏好日志已统一 |
| src/core/chat/services/ChatToolRuntimeResolver.ts | 已修复 | console 已切到 DebugLogger.warn |
| src/core/chat/services/ChatPlanSyncService.ts | 已修复 | console 已切到 DebugLogger.warn/error |
| src/core/chat/services/ChatHistoryParser.ts | 已修复 | console.warn 已切到 DebugLogger.warn |
| src/core/services/engine/FormTemplateProcessEngine.ts | 已修复 | console.warn 已切到 DebugLogger.warn |
| src/components/chat-components/hooks/useSlashCommand.ts | 已修复 | console.error 已切到 DebugLogger.error |
| src/utils/createFileByText.ts | 已修复 | console.warn 已切到 DebugLogger.warn |
| src/LLMProviders/openRouter.ts | 已修复 | console.warn/error 已切到 DebugLogger |
| src/LLMProviders/doubaoImage.ts | 已修复 | console.warn/error 已切到 DebugLogger |
| src/LLMProviders/grok.ts | 已修复 | console.warn 已切到 DebugLogger.warn |
| src/LLMProviders/kimi.ts | 已修复 | console.warn 已切到 DebugLogger.warn |
| src/LLMProviders/qwen.ts | 已修复 | console.warn 已切到 DebugLogger.warn |
| src/LLMProviders/gemini.ts | 已修复 | console.warn 已切到 DebugLogger.warn |
| src/LLMProviders/doubao.ts | 已修复 | console.warn/error 已切到 DebugLogger |
| src/utils/getEditorSelection.ts | 已修复 | console.error 已切到 DebugLogger.error |
| src/utils/convertFrontmatterValue.ts | 已修复 | console.warn 已切到 DebugLogger.warn |
| src/i18n/ai-runtime/helper.ts | 已修复 | console.error 已切到 DebugLogger.error |
| src/components/toast/Toast.tsx | 已修复 | console.error 已切到 DebugLogger.error |
| src/editor/chat/ChatEditorIntegration.tsx | 已修复 | 基线热点文案问题已处理 |
| src/components/chat-components/MessageItem.tsx | 已修复 | 热点文案问题已处理 |
| src/components/chat-components/ChatControls.tsx | 已修复 | 热点文案问题已处理 |
| src/components/chat-components/ChatHistory.tsx | 已修复 | 热点文案问题已处理 |
| src/components/chat-components/TemplateSelector.tsx | 已修复 | 热点文案问题已处理 |
| src/components/chat-components/FileMenuPopup.tsx | 已修复 | 热点文案问题已处理 |
| src/components/chat-components/ChatInput.tsx | 已修复 | 热点文案与日志问题已处理 |
| src/components/chat-components/ChatPersistentModal.tsx | 未修复 | 未在本轮变更范围内 |
| src/editor/selectionToolbar/QuickActionExecutionService.ts | 已修复 | 日志与错误文本已处理 |
| src/editor/selectionToolbar/QuickActionDataService.ts | 已修复 | 默认名称等文案已处理 |
| src/editor/selectionToolbar/ModifyTextModal.tsx | 已修复 | 弹窗文案已处理 |
| src/editor/selectionToolbar/QuickActionEditModal.tsx | 已修复 | fallback 中文热点已处理 |
| src/services/mcp/McpConfigModals.ts | 已修复 | 复制提示与日志问题已处理 |
| src/settings/system-prompts/SystemPromptDataService.ts | 未修复 | 本轮未处理 |
| src/settings/ai-runtime/utils/cryptoUtils.ts | 已修复 | console 已切到 DebugLogger |
| src/commands/chat/ChatViewCoordinator.ts | 已修复 | console 已切到 DebugLogger |
| src/core/chat/services/MultiModelChatService.ts | 已修复 | 多模型提示文案已处理 |
| src/components/toggle-switch/ToggleSwitch.tsx | 未修复 | 本轮未处理 |
| src/components/toast/ToastView.tsx | 已修复 | Close 等文案已处理 |
| src/editor/tabCompletion/TabCompletionService.ts | 已修复 | 英文硬编码提示已处理 |
| esbuild.config.mjs | 已修复 | 日志输出与 sourcemap 问题已处理 |
| scripts/build-and-sync.mjs | 已修复 | 脚本层直接 console 已切到统一脚本日志入口 |
| scripts/copy-to-vault.mjs | 已修复 | 剩余脚本日志已统一，关键复制路径信息默认可见 |
| scripts/provider-regression.mjs | 部分完成 | 直接 console 与旧 provider 路径已清理，但当前因断言与 provider API 漂移处于阻塞态 |
| version-bump.mjs | 已修复 | utf8 编码问题已处理 |
| tsconfig.json | 已修复 | sourcemap 相关配置已处理 |

## 七、推荐后续执行顺序

在当前 P0 已落地、构建通过的前提下，后续建议顺序如下：

1. 继续清理 src 下剩余项目自有 console 调用，并补齐仓库级排除口径
2. 单独整理 provider-regression 与当前 provider API 的漂移项
3. 全仓复扫 fallback 中文模式
4. 处理默认语言策略与规则口径冲突
5. 处理 ChatService 中的中文关键词行为判断

## 八、结论

截至当前工作区状态，基线中的 P0 治理链路已经基本落地：

- main.ts 职责下沉完成
- 启动链去阻塞完成
- DebugLogger 补齐完成
- 基线热点路径的 console 与 i18n 问题已处理
- 脚本编码与 sourcemap 规则冲突已处理
- 正式构建通过

尚未完成的主任务，已经从“基础治理链路修复”切换为“结构化重构与全仓清扫”：

- 仓库级日志复扫
- fallback 中文与默认语言策略统一
- 行为层双语治理
- 超大文件拆分
