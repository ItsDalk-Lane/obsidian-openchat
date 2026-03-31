# Chat Cleanup Audit Report

日期：2026-03-31  
范围：聊天界面、聊天 service/命令/持久化/类型、git 历史、兼容残留

## 1. 审计结论

本仓库不存在独立 HTTP 后端或数据库；“后端”实际对应聊天域的 service、命令、
provider 调用、历史持久化与状态模型。审计确认：

- 最近两轮前端删除主要发生在 2026-03-29 与 2026-03-31。
- 多模型对比能力并未被删除，只是删掉了旧 UI 外壳与配置服务。
- 系统提示词模板注入功能已经从前端主路径移除，但仍残留少量状态模型与辅助 API。
- MCP 三模式切换 UI 已完全孤立，但后端模式状态机仍保留；本轮已一并收口。
- `ChatSettings.enableSystemPrompt` 仅存于类型与默认配置，已确认属于残留设置项。
- 已实施一轮最小清理，删除了确认无引用的死代码与孤立 API，并完成验证。

## 2. 前端删除历史

| 日期 | 提交 | 删除项 | 结论 |
| --- | --- | --- | --- |
| 2026-03-31 | `7ca664cd04b2d946537b826fb67bbbf0c240dab0` | `SlashCommandMenu.tsx`、`TemplateSelector.tsx`、`TemplateSelector.css` | 旧模板/斜杠菜单 UI 已删除，现由 `PromptTemplateMenu` 与触发器菜单承接 |
| 2026-03-31 | `7ca664cd04b2d946537b826fb67bbbf0c240dab0` | `SystemPromptEditorModal.tsx`、`SystemPromptManagerModal.tsx`、`SystemPromptDataService.ts`、`types/system-prompt.ts` 等 | 系统提示词管理功能已下线 |
| 2026-03-29 | `6c24841c258ae86499e6919a52395dfa0a006bd7` | `CompareGroupManagerDialog.tsx`、`CompareModelSelector.tsx`、`MultiModelSelector.tsx` | 删的是旧对比 UI，不是多模型能力本身 |
| 2026-03-29 | `6c24841c258ae86499e6919a52395dfa0a006bd7` | `multi-model-config-service.ts` | 旧配置服务已删除，状态管理迁入主链 |
| 2026-03-26 | `f559420fa6fe26cd22223c9b8350142d5787277c` | `ChatSettingsModal.tsx`、`chatSettingsModalTypes.ts` | 旧聊天设置弹窗已删除，设置入口改为统一设置页 |

## 3. 聊天相关“后端”能力盘点

### 3.1 内部 API / 命令入口

- 视图与命令注册：`src/domains/chat/ui-view-coordinator.ts`
- 聊天 service 聚合 API：`src/core/chat/services/chat-service.ts`
- 状态 API：`src/core/chat/services/chat-service-state-api.ts`
- 历史与命令 API：`src/core/chat/services/chat-service-history-api.ts`
- 聊天命令执行：`src/core/chat/services/chat-command-facade.ts`
- slash/skill/sub-agent 命令：`src/core/chat/services/chat-commands.ts`

### 3.2 服务类

- `ChatFeatureManager`
- `ChatSessionManager`
- `HistoryService`
- `ChatToolRuntimeResolver`
- `ChatPlanSyncService`
- `ChatContextCompactionService`
- `MessageContextOptimizer`
- `ChatAttachmentSelectionService`
- `MultiModelChatService`

### 3.3 数据模型

- `ChatSession`
- `ChatState`
- `ChatMessage`
- `ChatSettings`
- `MessageManagementSettings`
- `ParallelResponseGroup` / `ParallelResponseEntry`
- `PlanSnapshot` / `PlanTask`
- `SelectedFile` / `SelectedFolder`

### 3.4 网络/外部端点

- 本地/远程模型能力探测：Ollama `POST /api/show`
- 其余模型请求由 `src/LLMProviders/**` 处理，聊天域只负责组装 provider 请求
- 结论：聊天域本身没有独立 REST API 控制器

## 4. 前后端功能映射

| 前端入口 | 当前后端/服务承接 | 状态 |
| --- | --- | --- |
| `ChatControls` 历史面板 | `listHistory/loadHistory/deleteHistory` -> `ChatSessionManager` / `HistoryService` | 正在使用 |
| `ChatInput` 模板菜单 | `selectPromptTemplate` -> `chat-service-history-api` | 正在使用 |
| `ChatInput` slash 命令 | `useChatInputSlashCommand` -> `loadInstalledSkills/loadInstalledSubAgents/executeSkillCommand/executeSubAgentCommand` | 正在使用 |
| `ChatControls` 多模型切换 | `setMultiModelMode/setLayoutMode` -> `MultiModelChatService` + frontmatter 持久化 | 正在使用 |
| `ChatMessages` 对比展示 | `ParallelResponseViewer` + `CompareTabBar` + `parallelResponses` | 正在使用 |
| 已孤立的 MCP 模式切换 UI | 无当前前端入口 | 后端三模式状态机已清理并收敛到单一路径 |
| 已删除系统提示词 UI | 无当前前端入口 | 后端残留已部分清理 |

## 5. 识别出的孤立接口/残留

### 已确认并已清理

| 项目 | 类型 | 证据 | 处理 |
| --- | --- | --- | --- |
| `src/components/chat-components/hooks/useSlashCommand.ts` | 死代码 | 全仓无引用 | 已删除 |
| `SlashCommandMenuProps` | 死类型 | 全仓无引用 | 已删除 |
| `getPromptTemplateContent()` | 孤立 service API | 全仓无引用 | 已删除 |
| `hasPromptTemplateVariables()` | 孤立 service API | 全仓无引用 | 已删除 |
| `ChatSession.systemPrompt` | 已废弃状态字段 | 前端删除后无运行时读写 | 已从类型模型移除 |
| `ChatSession.enableTemplateAsSystemPrompt` | 已废弃状态字段 | 前端删除后无运行时读写 | 已从类型模型移除 |
| `ChatState.enableTemplateAsSystemPrompt` | 已废弃状态字段 | toggle 已删除，无主路径使用 | 已从类型模型移除 |
| `src/components/chat-components/McpModeSelector.tsx` | 死组件 | 全仓无引用 | 已删除 |
| `mcpToolMode` / `mcpSelectedServerIds` | 半废弃状态机 | 无 UI 写入口，但 resolver 仍分支 | 已从状态、API、resolver 移除 |
| `ChatSettings.enableSystemPrompt` | 残留设置字段 | 仅存在于类型与默认值，无运行时消费 | 已删除 |

### 保留但不清理

| 项目 | 原因 |
| --- | --- |
| `src/commands/chat/chat-view-coordinator.ts` 等 shim | `docs/architecture.md` 明确要求保留兼容 shim |
| 多模型 service / compare workflow | 当前 UI 主路径仍在调用，非冗余 |

## 6. 安全性评估

### 风险面

- 聊天请求会组装 `systemPrompt`、上下文文件内容、所选图片与工具定义。
- 历史会话会写入 Vault Markdown frontmatter 与正文。
- sub-agent 定义可携带 `systemPromptOverride`，仍会进入 provider 请求。

### 本次清理结论

- 已删除残留字段本身不再参与敏感数据处理，不影响现有 provider 请求链。
- 未发现“前端已删但后端仍继续接收敏感系统提示词输入”的活跃 UI 入口。
- 旧历史文件若仍含 `enableTemplateAsSystemPrompt` frontmatter，当前解析逻辑已忽略；
  这属于数据整洁问题，不构成活跃敏感面。
- MCP 模式链路不涉及密钥或私密持久化数据；风险主要是不可达分支增加维护面，
  而非直接数据泄露。

## 7. 清理计划

### 已执行顺序

1. 先确认 git 历史中的真实删除范围。
2. 再用引用扫描区分“兼容 shim”和“孤立残留”。
3. 先删死代码与孤立 API，再删类型模型中的废弃字段。
4. 对 MCP 模式半废弃状态机做整链收口，避免只删前端不删 resolver。
5. 最后跑测试、lint 与 build 验证。

### 后续建议

1. 若要清理历史数据，可新增一次性脚本，批量移除历史 Markdown frontmatter 中的
   `enableTemplateAsSystemPrompt` 旧字段。
2. 继续保留 chat legacy shim，直到对外导入路径兼容窗口结束。
3. 为无引用导出建立自动化 dead-code 检查，避免下一次 UI 重构后再次遗留。

### 数据迁移说明

- 无独立数据库，因此无 SQL migration。
- 当前仅存在 Markdown frontmatter / localStorage 兼容面。
- 运行时已兼容旧 frontmatter；物理数据清理可后续单独执行，不阻塞当前发布。

## 8. 验证结果

- `npm run test:chat-core` 通过，12/12
- `npm run test:domains` 通过，97/97
- `npm run lint:arch` 通过，0 违规
- `npm run lint:taste` 通过，0 违规
- `npm run build` 通过

## 9. 测试覆盖说明

仓库当前未配置 line/branch coverage 统计工具，因此无法输出百分比覆盖率报告。
本次以“相关测试集合全部通过”作为覆盖证明，重点覆盖了：

- provider message 组装
- chat state API
- history frontmatter 兼容
- prompt template 发送路径
- chat domain helper 与 compaction

## 10. 本次删除清单

- `src/components/chat-components/hooks/useSlashCommand.ts`
- `src/core/chat/types/slashCommand.ts` 中未使用的 `SlashCommandMenuProps`
- `src/core/chat/services/chat-service-history-api.ts` 中未使用的模板辅助 API
- `src/domains/chat/types.ts` 中废弃的模板系统提示词残留字段
- `src/core/chat/services/chat-service-internals.ts` 中对应废弃状态初始化
- `src/components/chat-components/McpModeSelector.tsx`
- chat MCP 三模式相关状态、API 与 resolver 分支
- chat 设置中的 `enableSystemPrompt`
