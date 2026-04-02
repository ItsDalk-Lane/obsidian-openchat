# ADR 2026-04-02: 内置工具迁移完成后的事实来源与范围

## 状态

已采纳

## 背景

- 2026-04-01 的两阶段 surface ADR 已经确定：默认聊天轮次先做 discovery / candidate
  收敛，再暴露 executable tool set。
- 2026-04-02 的 builtin tool 路线图已经完成契约扩展、执行器升级、绝大多数旧工具迁移，
  并新增了一批 Obsidian 原生工具。
- 当前需要一份收口 ADR，明确“现在以哪里为事实来源”、“builtin runtime 当前到底包含什么”，
  以及哪些例外仍被保留。

## 决策

1. 已迁移或新增的 builtin tool，默认以工具邻近目录为事实来源：
   - `tool.ts`
   - `schema.ts`
   - `description.ts`
   - `service.ts`
2. 已迁移 builtin tool 的默认 `surface` 与 `runtimePolicy` 由工具本体提供；
   `chat-tool-discovery-blueprints.ts` 只保留三类内容：
   - legacy bridge
   - override
   - non-BuiltinTool 例外
3. `BuiltinToolsRuntime` 当前按 settings 与宿主能力注册以下家族：
   - script：`run_script`、`run_shell`
   - workflow：`write_plan`、`ask_user`
   - time：`get_time`、`get_current_time`、`convert_time`、`calculate_time_range`
   - vault：读取、目录发现、写入、破坏性操作、`append_daily_note`、`property_edit`
   - web：`bing_search`、`fetch`、`fetch_webpage`、`fetch_webpages_batch`
   - link / graph：`get_first_link_path`、`backlink_analyze`
   - obsidian：`list_commands`、`run_command`
   - canvas：`read_canvas`、`edit_canvas`
   - mcp resources：`list_mcp_resources`、`read_mcp_resource`
   - integration：`dataview_query`
   - skills：`discover_skills`、`invoke_skill`
4. 可选能力继续按运行时 gating 暴露：
   - `dataview_query` 只在 Dataview 插件可用时进入 builtin runtime
   - MCP 资源工具只在 `mcpManager` 存在时注册
   - skills 只在 `skillScanner` 存在时注册
5. `sub-agents` 继续保持独立 `ToolDefinition` 体系；Step 14 的收口结果是
   “保留独立体系并在 discovery resolver 侧桥接”，而不是迁入 `BuiltinTool`。
6. 历史上的 step-suffixed regression test 文件可以继续保留，作为路线图阶段性的
   回归锚点；它们不是 runtime legacy bridge，也不是待删除 TODO。
7. Step 07 已完成：
   `search_content` 与 `query_index` 已迁入
   `src/tools/vault/search-content/**` 与 `src/tools/vault/query-index/**`；
   `src/tools/vault/filesystemSearchHandlers.ts` 仅保留兼容桥接注册与
   `stat_path` legacy handler。

## 直接后果

- 架构文档、发布说明与路线图执行记录现在应更新为“Step 07 已补齐”，
   不再继续保留旧的 legacy island 叙述。
- 当前状态可以视为“路线图范围内的 builtin runtime 与新增工具范围已稳定”，
   下一步进入发布准备与真实 Obsidian smoke test。
- 未来新增 builtin tool 继续沿用“邻近目录 + 邻近 surface/runtimePolicy +
  optional gating”的模式，不再回退到集中式大 handler 定义。
