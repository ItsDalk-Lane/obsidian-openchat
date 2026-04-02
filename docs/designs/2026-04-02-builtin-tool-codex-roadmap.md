# 2026-04-02 内置工具架构升级 Codex 分步实施路线图

## 1. 适用范围
本路线图只服务于一个目标：

1. 先把现有 `BuiltinTool` 体系下的旧工具逐步迁移到新结构。
2. 在旧工具迁移稳定后，再逐步增加新的 Obsidian 场景工具。

这里的“现有工具”主要指 `src/tools/**` 中以 `BuiltinTool` 形态存在的工具。
`sub-agents` 当前属于独立 `ToolDefinition` 体系，不直接迁入 `BuiltinTool` 契约；
路线图里会安排一次收尾检查，但不作为本轮核心迁移对象。

## 2. 总执行规则

### 2.1 每次 Codex 对话只做一个 Step

- 不允许一个对话同时跨两个 Step。
- 如果一个 Step 中途发现范围过大，先在当前对话里把它继续拆小，再结束本轮。
- 未完成当前 Step 的验收，不进入下一步。

### 2.2 每个 Step 的收尾动作固定
每次对话结束前必须完成：

- 代码或文档修改。
- 针对本步的最小验证。
- 更新 `task_plan.md`、`findings.md`、`progress.md`。
- 明确写出“下一步应该执行哪个 Step”。

### 2.3 不混做迁移和新增

- Step 01 到 Step 14 只做旧工具迁移和基础设施收敛。
- Step 15 起才允许新增工具。
- 如果某个新增工具依赖运行时能力未到位，必须回到前置 Step 补齐。

### 2.4 向下兼容优先

- 任何旧工具名、旧 wrapper、旧 surface 在迁移期都必须继续可用。
- 旧工具允许保留 legacy shape，但迁移完成后应在文档中标注为待淘汰或已完成。

## 3. 每次对话建议开场提示词

后续每开一个新对话，建议直接要求 Codex：
“请按照 `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step XX 执行，
只完成这一步，并在结束前更新 `task_plan.md`、`findings.md`、`progress.md`。”

## 4. Step 列表总览
| Step | 类型 | 目标 |
| --- | --- | --- |
| 01 | 基础设施 | 扩展 `BuiltinTool` 契约与 supporting types |
| 02 | 基础设施 | 升级 `BuiltinToolExecutor` 执行流水线 |
| 03 | 基础设施 | 升级注册入口、registry 与兼容桥接 |
| 04 | 结构整理 | 建立新目录规范与共享 helper 落点 |
| 05 | 旧工具迁移 | 迁移 Vault 读取/导航工具 |
| 06 | 旧工具迁移 | 迁移 Vault 目录/路径发现工具 |
| 07 | 旧工具迁移 | 迁移 Vault 搜索/索引工具 |
| 08 | 旧工具迁移 | 迁移 Vault 写入工具 |
| 09 | 旧工具迁移 | 迁移 Vault 破坏性工具 |
| 10 | 旧工具迁移 | 迁移 Web 工具 |
| 11 | 旧工具迁移 | 迁移 Script 工具 |
| 12 | 旧工具迁移 | 迁移 Time 工具 |
| 13 | 旧工具迁移 | 迁移 Link / Plan / Skill 工具 |
| 14 | 收敛收尾 | surface 蓝图收敛、回归测试、非 BuiltinTool 收尾检查 |
| 15 | 新工具 | 新增 `ask_user` |
| 16 | 新工具 | 新增 `append_daily_note` |
| 17 | 新工具 | 新增 `property_edit` |
| 18 | 新工具 | 新增 `backlink_analyze` |
| 19 | 新工具 | 新增 `list_commands` + `run_command` |
| 20 | 新工具 | 新增 `list_mcp_resources` + `read_mcp_resource` |
| 21 | 新工具 | 新增 `read_canvas` + `edit_canvas` |
| 22 | 新工具 | 新增 `dataview_query` |
| 23 | 最终收口 | 文档、决策记录、回归验证与发布准备 |

## 5. 详细步骤

### Step 01：扩展 `BuiltinTool` 契约与 supporting types

- 目标：在不破坏旧工具的前提下，引入新契约字段与 `buildBuiltinTool()`。
- 重点文件：
  - `src/tools/runtime/types.ts`
  - `src/tools/runtime/build-tool.ts`（新增）
  - `src/tools/runtime/tool-result.ts`
- 必做事项：
  - 增加 `validateInput`、`checkPermissions`、动态风险、进度、摘要等可选字段。
  - 增加 `BuiltinToolDescriptionContext`、`BuiltinValidationResult`、
    `BuiltinPermissionDecision`、`BuiltinToolExecutionContext`。
  - 提供 fail-closed 默认值工厂。
- 验收标准：
  - 旧工具无需修改即可通过类型检查。
  - 新工具可以通过 `buildBuiltinTool()` 创建。
  - 没有运行时行为变更。
- 建议验证：
  - 运行与 runtime 类型相关的测试。
  - 至少执行一次 `tsc` 或项目等效类型检查。

### Step 02：升级 `BuiltinToolExecutor` 执行流水线

- 目标：把“结构校验 -> 业务校验 -> 权限确认 -> 执行 -> 输出校验”接入执行器。
- 重点文件：
  - `src/tools/runtime/BuiltinToolExecutor.ts`
  - `src/core/agents/loop/tool-call-validation.ts`
  - `src/tools/runtime/tool-result.ts`
- 必做事项：
  - 接入 `validateInput()`。
  - 接入 `checkPermissions()` 与 `requestConfirmation()`。
  - 接入 `reportProgress()`、`getToolUseSummary()`、`getActivityDescription()`。
  - 保持旧工具默认走兼容路径。
- 验收标准：
  - legacy 工具仍能执行。
  - 新钩子会被执行器消费。
  - 结构化错误能映射回现有错误上下文体系。
- 建议验证：
  - 给执行器新增单测。
  - 回归一个读工具和一个写工具的调用链。

### Step 03：升级注册入口、registry 与兼容桥接

- 目标：让 `registerBuiltinTool()`、`BuiltinToolRegistry` 同时支持旧 shape 和新 shape。
- 重点文件：
  - `src/tools/runtime/register-tool.ts`
  - `src/tools/runtime/tool-registry.ts`
  - `src/tools/runtime/BuiltinToolsRuntime.ts`
- 必做事项：
  - `registerBuiltinTool()` 内部改为走 `buildBuiltinTool()`。
  - 支持从工具对象读取 `surface` / `runtimePolicy` 邻近元数据。
  - 保持 MCP server 注册逻辑兼容。
- 验收标准：
  - 现有通过 `registerBuiltinTool()` 注册的工具行为不变。
  - 直接返回 `BuiltinTool[]` 的工厂工具也可接入新契约。
- 建议验证：
  - runtime 初始化相关测试。
  - 手动抽查 `filesystem`、`web`、`time` 至少各一个工具注册结果。

### Step 04：建立新目录规范与共享 helper 落点

- 目标：先搭好“每工具一目录”的骨架和共享 `_shared` 布局。
- 重点文件：
  - `src/tools/vault/**`
  - `src/tools/web/**`
  - `src/tools/runtime/**`
- 必做事项：
  - 为 Vault 域建立 `_shared/`。
  - 约定 `tool.ts`、`schema.ts`、`description.ts`、`service.ts` 的角色。
  - 不大迁工具，只做目录与导出骨架。
- 验收标准：
  - 新目录结构可被后续 Step 复用。
  - 不引入功能行为变化。
- 建议验证：
  - 仅跑最小 lint/typecheck。

### Step 05：迁移 Vault 读取/导航工具

- 目标：迁移最常用、低风险、最能验证新结构的读取类工具。
- 迁移对象：
  - `read_file`
  - `read_media`
  - `open_file`
- 重点文件：
  - `src/tools/vault/filesystemReadWriteHandlers.ts`
  - `src/tools/vault/nav-tools.ts`
  - 新目录下对应 `tool.ts` / `service.ts`
- 必做事项：
  - 改成新目录结构。
  - 为工具补 `getToolUseSummary()`、`getActivityDescription()`。
  - 对 `open_file` 补“何时不要用”的邻近描述和稳定目标语义。
- 验收标准：
  - 三个工具保持原工具名与原输出兼容。
  - 新结构下不再需要跨大文件寻找定义。
- 建议验证：
  - 相关单测。
  - 手工调用读取一个笔记、读取一个媒体、打开一个文件。

### Step 06：迁移 Vault 目录/路径发现工具

- 目标：把“发现类”工具先完整迁走，形成清晰的 discover 层。
- 迁移对象：
  - `find_paths`
  - `list_directory_flat`
  - `list_directory_tree`
  - `list_vault_overview`
- 重点文件：
  - `src/tools/vault/filesystemSearchHandlers.ts`
  - `src/tools/vault/filesystemListDirHandlers.ts`
  - `src/tools/vault/filesystemWrapperTools.ts`
- 必做事项：
  - 统一这四个工具的 `surface.family` 与发现语义。
  - 明确目标参数只接受查询条件或显式目录路径。
  - 保持 wrapper 工具继续存在。
- 验收标准：
  - discover 类工具不会混入写入语义。
  - `find_paths` 和目录工具的边界清楚。
- 建议验证：
  - 目录列出、路径查找相关测试。

### Step 07：迁移 Vault 搜索/索引工具

- 目标：完成 Vault 搜索类能力迁移，并利用新契约表达搜索语义。
- 迁移对象：
  - `search_content`
  - `query_index`
- 重点文件：
  - `src/tools/vault/filesystemSearchHandlers.ts`
  - `src/tools/vault/filesystemQueryIndex.ts`
  - `src/core/chat/services/chat-tool-task-signature.ts`
- 必做事项：
  - 为 `query_index` 明确结果序列化策略。
  - 为 `search_content` 明确 regex / context_lines 等约束参数语义。
  - 检查 task signature / candidate scoring 对迁移后结果的兼容性。
- 验收标准：
  - 搜索类工具结果仍能被现有 routing/signature 逻辑识别。
  - 不引入 `grep_content` 之类重复工具。
- 建议验证：
  - 与 `query_index`、`search_content` 相关的 chat service 测试。

### Step 08：迁移 Vault 写入工具

- 目标：先迁写入但非破坏性最高的文件写入工具。
- 迁移对象：
  - `write_file`
  - `edit_file`
- 重点文件：
  - `src/tools/vault/filesystemReadWriteHandlers.ts`
  - `src/core/services/fileOperationHelpers.ts`
  - 新目录下对应工具文件
- 必做事项：
  - 补 `validateInput()`。
  - 补 `checkPermissions()`。
  - 补动态 `isReadOnly()` / `isDestructive()` / `isConcurrencySafe()`。
  - 让 `edit_file` 的最小锚点策略保持兼容。
- 验收标准：
  - 不破坏现有编辑工作流。
  - 执行器可在写入前触发权限确认。
- 建议验证：
  - 文件写入/编辑测试。
  - 手工演练整文件写入与局部编辑。

### Step 09：迁移 Vault 破坏性工具

- 目标：把删除/移动类高风险工具迁到新确认流上。
- 迁移对象：
  - `move_path`
  - `delete_path`
- 重点文件：
  - `src/tools/vault/filesystemReadWriteHandlers.ts`
  - 相关删除/移动 helper
- 必做事项：
  - 使用 `checkPermissions()` 返回 `ask`。
  - 补充清晰的活动摘要和失败恢复信息。
  - 确保不会因并发执行导致路径竞争。
- 验收标准：
  - 危险工具默认进入确认流。
  - 旧调用方式仍能兼容。
- 建议验证：
  - 删除/移动相关测试。
  - 人工验证 ask/deny/allow 三种决策分支。

### Step 10：迁移 Web 工具

- 目标：迁移网络读取域，并统一 wrapper 与兼容工具的关系。
- 迁移对象：
  - `bing_search`
  - `fetch`
  - `fetch_webpage`
  - `fetch_webpages_batch`
- 重点文件：
  - `src/tools/web/bing-search-tools.ts`
  - `src/tools/web/fetch-tools.ts`
  - `src/tools/web/fetch-wrapper-tools.ts`
  - `src/tools/web/fetch-tool-support.ts`
- 必做事项：
  - 保留 `fetch` 作为兼容型多模式工具，但把 wrapper 作为首选 surface。
  - 为长网页抓取接入进度和结果摘要。
  - 检查 wrapper surface 测试。
- 验收标准：
  - `fetch_webpage` / `fetch_webpages_batch` 行为保持稳定。
  - `fetch` 仍可兼容旧调用。
- 建议验证：
  - `chat-tool-wrapper-surface.test.ts`
  - 手动抓取单网页与批量网页。

### Step 11：迁移 Script 工具

- 目标：迁移最敏感的 workflow 工具域。
- 迁移对象：
  - `run_script`
  - `run_shell`
- 重点文件：
  - `src/tools/script/script-tools.ts`
  - `src/tools/runtime/script-runtime.ts`
  - 相关 workflow policy / routing 文件
- 必做事项：
  - 为 `run_shell` 明确 `checkPermissions()` 与动态风险。
  - 为 `run_script` 明确并发、中断、执行摘要。
  - 确认 selection coordinator 与 workflow policy 不被破坏。
- 验收标准：
  - 桌面端 shell 执行兼容。
  - workflow-only 工具的 surface 与确认流正确。
- 建议验证：
  - `chat-tool-selection-coordinator` 相关测试。
  - 手工运行一个安全 shell 命令与一个简单脚本。

### Step 12：迁移 Time 工具

- 目标：迁移低风险但多模式明显的时间工具，验证“兼容工具 + wrapper”模式。
- 迁移对象：
  - `get_time`
  - `get_current_time`
  - `convert_time`
  - `calculate_time_range`
- 重点文件：
  - `src/tools/time/time-tools.ts`
  - `src/tools/time/time-wrapper-tools.ts`
- 必做事项：
  - 保留 `get_time` 作为兼容型工具。
  - 把三个 wrapper 作为首选 surface。
  - 让模式校验优先进入 `validateInput()`，减少 `execute()` 里混杂校验。
- 验收标准：
  - wrapper 与兼容工具均可运行。
  - 参数边界更清晰。
- 建议验证：
  - 时间工具现有测试。
  - 三种模式手工调用各一次。

### Step 13：迁移 Link / Plan / Skill 工具

- 目标：迁移剩余低风险工具，完成 BuiltinTool 体系主体迁移。
- 迁移对象：
  - `get_first_link_path`
  - `write_plan`
  - `discover_skills`
  - `invoke_skill`
- 重点文件：
  - `src/tools/link/link-tools.ts`
  - `src/tools/plan/plan-tools.ts`
  - `src/tools/skill/skill-tools.ts`
- 必做事项：
  - 为这些工具补齐新结构和邻近元数据。
  - 保持 skill 工具的特殊返回格式兼容。
- 验收标准：
  - 所有 `BuiltinTool[]` 工厂已迁到新结构。
  - 剩余未迁对象只允许是非 `BuiltinTool` 体系。
- 建议验证：
  - link / plan / skill 相关测试。

### Step 14：surface 收敛、回归测试与非 BuiltinTool 收尾检查

- 目标：完成迁移期收口，而不是新增功能。
- 重点文件：
  - `src/core/chat/services/chat-tool-discovery-blueprints.ts`
  - `src/core/chat/services/chat-tool-runtime-resolver-support.ts`
  - `src/tools/sub-agents/**`
- 必做事项：
  - 把已迁工具的事实来源尽量收回工具邻近位置。
  - 蓝图文件改成 fallback / override / legacy bridge。
  - 检查 `sub-agents` 是否仍明确属于独立 `ToolDefinition` 体系，并在文档中注明不迁。
- 验收标准：
  - 旧工具迁移主线完成。
  - 没有大范围 surface 漂移。
  - 回归测试通过。
- 建议验证：
  - chat tool selection / candidate / wrapper / routing 全套关键测试。

### Step 15：新增 `ask_user`

- 目标：先落地最关键的新工作流工具。
- 重点文件：
  - 新增 `src/tools/workflow/ask-user/**`
  - `BuiltinToolExecutor` 相关确认/响应接线
- 必做事项：
  - 只做“用户澄清”，不做权限确认。
  - 支持 options 和自由文本两种回答路径。
  - 没有 UI 能力时返回结构化失败。
- 验收标准：
  - 能在 host 通道请求用户输入。
  - 与权限确认流不混用。

### Step 16：新增 `append_daily_note`

- 目标：落地第一个 Obsidian 高频原生场景工具。
- 重点文件：
  - 新增 `src/tools/vault/append-daily-note/**`
  - 可能涉及 daily note 配置读取 helper
- 必做事项：
  - 工具内部解析 daily note 路径规则。
  - 仅暴露用户真正需要决定的参数：日期、内容、目标标题。
  - 不把 UI/流程参数暴露给模型。
- 验收标准：
  - 能向今日或指定日期笔记追加内容。
  - 路径解析不依赖模型猜测。

### Step 17：新增 `property_edit`

- 目标：给 frontmatter 提供结构化变更入口。
- 重点文件：
  - 新增 `src/tools/vault/property-edit/**`
  - frontmatter 解析/回写 helper
- 必做事项：
  - 支持 `set` / `delete` / `append` / `remove`。
  - 明确只作用于 frontmatter，不扩张为正文编辑工具。
  - 正确处理数组、标签、日期。
- 验收标准：
  - 比 `edit_file` 更安全稳定地处理属性变更。

### Step 18：新增 `backlink_analyze`

- 目标：补足 Obsidian 图谱语义。
- 重点文件：
  - 新增 `src/tools/graph/backlink-analyze/**`
- 必做事项：
  - 第一阶段仅做一跳邻居分析。
  - 返回 incoming / outgoing / mutual / unresolved。
  - 保持只读。
- 验收标准：
  - 工具能稳定用于“理解笔记关系”而不是改文件。

### Step 19：新增 `list_commands` + `run_command`

- 目标：把“操作 Obsidian 本身”的能力引入工具层。
- 重点文件：
  - 新增 `src/tools/obsidian/commands/**`
- 必做事项：
  - `list_commands` 负责 discover。
  - `run_command` 负责 invoke。
  - `run_command` 的确认必须走权限流，不是普通参数。
- 验收标准：
  - 可列命令、可执行命令。
  - 未知高风险命令有确认保护。

### Step 20：新增 `list_mcp_resources` + `read_mcp_resource`

- 目标：把 MCP 资源能力补齐到内置工具层。
- 重点文件：
  - 新增 `src/tools/mcp/resources/**`
  - MCP runtime 相关接线
- 必做事项：
  - 先列资源，再读取资源。
  - 避免模型凭空猜 URI。
  - 保持只读。
- 验收标准：
  - 已连接 MCP server 的资源可被模型发现并读取。

### Step 21：新增 `read_canvas` + `edit_canvas`

- 目标：增加 Obsidian Canvas 支持。
- 重点文件：
  - 新增 `src/tools/canvas/read-canvas/**`
  - 新增 `src/tools/canvas/edit-canvas/**`
- 必做事项：
  - `read_canvas` 只读节点、边与摘要。
  - `edit_canvas` 再处理节点、位置、连线变更。
  - 不把读写混成一个工具。
- 验收标准：
  - Canvas 文件可被独立读取与编辑。

### Step 22：新增 `dataview_query`

- 目标：提供可选集成能力，而不是核心前置能力。
- 重点文件：
  - 新增 `src/tools/integrations/dataview-query/**`
- 必做事项：
  - 先检测 Dataview 插件是否存在。
  - 缺失时不要暴露或返回清晰不可用原因。
  - 保持只读。
- 验收标准：
  - 安装 Dataview 时可查询。
  - 未安装时行为可预期。

### Step 23：最终收口与发布准备

- 目标：把整条迁移链真正变成可交付状态。
- 重点文件：
  - `docs/architecture.md`
  - `docs/decisions/*`
  - release note / 变更说明
- 必做事项：
  - 更新架构文档与 ADR。
  - 清理已不需要的 legacy 标记或 TODO。
  - 跑最终回归。
- 验收标准：
  - 文档与实现一致。
  - 迁移范围和新增工具范围都有记录。
  - 可以开始准备发布或下一轮功能扩展。

## 6. 每个 Step 的统一完成定义

只有同时满足以下条件，才算当前 Step 结束：

- 代码、测试、文档三者中至少有代码或文档产出。
- 已执行与本步相称的最小验证，而不是“未验证直接结束”。
- `task_plan.md`、`findings.md`、`progress.md` 已更新。
- 明确说明是否可以进入下一步。

## 7. 推荐执行顺序说明

- Step 01 到 Step 03 是绝对前置，不能跳。
- Step 04 是目录骨架，强烈建议先做，否则后续每次迁移都会返工。
- Step 05 到 Step 13 按风险递增迁移旧工具，不建议打乱。
- Step 14 是旧工具迁移完成的关口，必须完成后再进入新工具阶段。
- Step 15 到 Step 20 是推荐优先级最高的新工具序列。
- Step 21、Step 22 属于第三批增强能力，可在时间紧张时后置。
