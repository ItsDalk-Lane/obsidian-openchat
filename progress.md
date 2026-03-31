# 会话进度

## 2026-03-31

- 已读取项目 `CLAUDE.md`、`docs/architecture.md`、`docs/golden-principles.md`、
  `docs/garbage-collection.md`。
- 已读取全局质量/操作规范，并确认需要以正式审计方式留档。
- 已确认工作树存在聊天相关脏改动，后续操作必须避免覆盖。
- 已初始化本次任务的规划文件。
- 已确认聊天 UI 删除历史与当前多模型/模板功能保留范围。
- 已执行最小清理：
  - 删除未引用的 `src/components/chat-components/hooks/useSlashCommand.ts`
  - 删除未使用的 `SlashCommandMenuProps`
  - 删除 `getPromptTemplateContent()` / `hasPromptTemplateVariables()`
  - 清理 chat 类型中已废弃的模板系统提示词残留字段
- 已追加 MCP 模式链路清理：
  - 删除未引用的 `src/components/chat-components/McpModeSelector.tsx`
  - 删除 `mcpToolMode` / `mcpSelectedServerIds` 状态与公开 API
  - 将 `ChatToolRuntimeResolver` 收敛为单一路径，保留显式过滤语义
- 已删除 `ChatSettings.enableSystemPrompt` 残留字段及默认值。
- 已完成验证：
  - `npm run test:chat-core`
  - `npm run test:domains`
  - `npm run lint:arch`
  - `npm run lint:taste`
  - `npm run build`
- 已完成 MCP 三模式链路验证：
  - `rg` 确认 `McpModeSelector`、`mcpToolMode`、`mcpSelectedServerIds`、
    `setMcpToolMode`、`setMcpSelectedServerIds`、`McpToolMode` 引用为 0
