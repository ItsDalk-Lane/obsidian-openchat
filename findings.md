# 审计发现记录

## 规则与上下文

- 项目采用分域分层架构，聊天域存在 `src/domains/chat/**` 真源与
  `src/core/chat/**`、`src/commands/chat/**` legacy 兼容层并存的情况。
- 本轮用户任务聚焦聊天界面相关功能，且要求交付清理方案与验证结果。
- 当前工作树已有聊天域未提交改动，后续任何清理都必须避开这些未决更改。

## 初步观察

- 仓库未见独立服务端目录；需要把“后端”解释为插件内部非 UI 的 service、
  provider、持久化与命令层能力。
- `docs/architecture.md` 明确指出部分 chat legacy 文件“仅保留兼容 shim”，
  这些文件是本轮重点核查对象。

## 关键发现

- 2026-03-31 提交 `7ca664cd04b2d946537b826fb67bbbf0c240dab0` 删除了
  `SlashCommandMenu.tsx`、`TemplateSelector.tsx`、`TemplateSelector.css`，
  同时移除了系统提示词管理相关组件与类型。
- 2026-03-29 提交 `6c24841c258ae86499e6919a52395dfa0a006bd7` 删除了
  `CompareGroupManagerDialog.tsx`、`CompareModelSelector.tsx`、
  `MultiModelSelector.tsx` 与 `multi-model-config-service.ts`，但多模型对比主链
  仍由 `ModeSelector`、`ModelSelector`、`ParallelResponseViewer`、
  `MultiModelChatService` 继续承担，因此不能作为冗余整体删除。
- 当前版本里 `ChatSession.systemPrompt`、`ChatSession.enableTemplateAsSystemPrompt`、
  `ChatState.enableTemplateAsSystemPrompt` 已不再被运行时代码读写，只剩类型/测试残留。
- `src/core/chat/services/chat-service-history-api.ts` 中
  `getPromptTemplateContent()` 与 `hasPromptTemplateVariables()` 无调用方，属于孤立 API。
- `src/components/chat-components/hooks/useSlashCommand.ts` 已无任何引用，
  与现行的 `useChatInputSlashCommand.ts` 实现重复。
- `src/components/chat-components/McpModeSelector.tsx` 已完全无引用，但
  `mcpToolMode` / `mcpSelectedServerIds` 仍驱动 `ChatToolRuntimeResolver`
  的三模式分支，构成前后端失配的半废弃功能栈。
- `ChatSettings.enableSystemPrompt` 仅残留在 chat 域类型与默认配置中，
  当前聊天 UI、state API 与 provider message 主链均不再消费。
