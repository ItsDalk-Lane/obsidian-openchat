# 2026-04-02 内置工具迁移与新增工具发布说明

这轮更新的目标，是把 builtin tool 从“薄工具 + 分散元数据”推进到
“工具邻近定义 + 可执行语义完整 + 默认 surface 更稳定”的状态。

## 这轮完成了什么

- `BuiltinTool` 现在支持工具级校验、权限确认、动态风险、进度与结果序列化。
- `BuiltinToolExecutor` 已按“参数补全 -> schema 校验 -> `validateInput()` ->
  `checkPermissions()` -> execute -> output validation”的顺序执行。
- 已迁移或新增的 builtin tool 默认以单工具目录为事实来源：
  `tool.ts`、`schema.ts`、`description.ts`、`service.ts`。
- discovery 蓝图现在主要只保留 legacy bridge / override / non-BuiltinTool 例外。

## 新增工具范围

- `ask_user`
- `append_daily_note`
- `property_edit`
- `backlink_analyze`
- `list_commands`
- `run_command`
- `list_mcp_resources`
- `read_mcp_resource`
- `read_canvas`
- `edit_canvas`
- `dataview_query`

## 兼容性与例外

- 旧工具名、旧 wrapper 与 legacy surface 兼容入口仍然保留。
- `sub-agents` 继续保持独立 `ToolDefinition` 体系，没有迁入 `BuiltinTool`。
- `dataview_query` 只在 Dataview 插件可用时暴露。
- MCP 资源工具只在存在 `mcpManager` 时进入 builtin runtime。
- `search_content` 与 `query_index` 已迁入各自单工具目录；
  `src/tools/vault/filesystemSearchHandlers.ts` 仅保留兼容桥接注册与
  `stat_path` legacy handler。

## 验证结果

- `npm run lint`
- `npm run test`
- `npm run build`

以上命令已在 2026-04-02 执行通过。

## 发布口径

- 当前状态已经可以进入发布准备与真实 Obsidian 手工 smoke test。
- 4 月 2 日 builtin tool 路线图中原先剩余的 Step 07 迁移缺口已补齐。
