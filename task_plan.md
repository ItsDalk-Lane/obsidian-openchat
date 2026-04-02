# 聊天功能孤立代码审计与清理计划

## 目标

确认聊天界面相关前端组件的删除历史，建立前后端功能映射，识别孤立后端接口/服务，
评估安全风险，制定并在可控范围内实施清理与验证，最终输出带证据的审计报告。

## 阶段

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| 1. 规则与范围确认 | completed | 已读取规则链、确认工作树状态、界定聊天相关范围 |
| 2. 前端删除历史梳理 | completed | 已确认 2026-03-29/2026-03-31 的聊天 UI 删除提交 |
| 3. 后端聊天能力盘点 | completed | 已梳理 chat service、命令、持久化、类型与网络入口 |
| 4. 前后端映射与孤立识别 | completed | 已识别系统提示词残留字段、死 Hook、未使用 API |
| 5. 安全评估与清理方案 | completed | 已评估敏感面集中在 provider/systemPrompt 注入与历史 frontmatter |
| 6. 实施清理与验证 | completed | 已执行最小清理并通过测试、lint、build 验证 |
| 7. 报告交付 | completed | 已补充 MCP 三模式孤立链、清理结果与验证记录 |

## 已知约束

- 当前工作树存在与聊天域相关的未提交改动，禁止覆盖或回退用户改动。
- 受保护产物 `main.js`、`styles.css`、`manifest.json` 不可手改。
- 需要优先保证向下兼容；若清理存在隐藏调用风险，需要先报告再决定是否删除。

## 风险记录

| 风险 | 影响 | 缓解措施 |
| --- | --- | --- |
| 聊天域处于迁移中，legacy shim 与真源并存 | 可能误判“冗余”为兼容层 | 对每个候选项补做引用链与 git 历史验证 |
| 当前工作树脏改动集中在聊天域 | 直接修改可能与用户改动冲突 | 清理仅限明确孤立文件，改前先读取相关文件最新内容 |
| Obsidian 插件无传统 HTTP 后端 | “后端”需解释为 service/provider/持久化层 | 在报告中明确术语映射，避免误导 |

## 2026-04-02 内置工具架构升级设计计划

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| 1. 现状与结论收敛 | completed | 已根据源码与两份分析文档确认“单工具薄、外层系统强”的真实现状 |
| 2. 目标契约设计 | completed | 已形成新的 `BuiltinTool` 扩展方向、执行流水线与 fail-closed 原则 |
| 3. 新增工具目录整理 | completed | 已筛出首批/次批新增工具，并排除与现有能力重复的错误提议 |
| 4. 文档落库 | completed | 已输出主设计文档与实施/工具目录附录 |
| 5. Codex 分步路线图 | completed | 已输出按单对话可执行粒度拆分的完整实施路线图 |

## 2026-04-02 内置工具路线图执行

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| Step 01：扩展 `BuiltinTool` 契约与 supporting types | completed | 已扩展 runtime 契约，并新增 build 工厂与序列化辅助函数 |
| Step 02：升级 `BuiltinToolExecutor` 执行流水线 | completed | 已接入业务校验、权限确认、进度与输出校验，并保留 legacy 兼容路径 |
| Step 03：升级注册入口、registry 与兼容桥接 | completed | 已兼容旧/新 shape，并桥接邻近 `surface` / `runtimePolicy` 元数据 |
| Step 04：建立新目录规范与共享 helper 落点 | completed | 已建立 `runtime` 目录约定、`vault/_shared` 出口与首批工具骨架 |
| Step 05：迁移 Vault 读取/导航工具 | completed | 已迁移三项读取/导航工具到单工具目录，并保留旧注册入口兼容 |
| Step 06：迁移 Vault 目录/路径发现工具 | completed | 已迁移 discover 工具到单工具目录，并保留旧 wrapper 兼容层 |
| Step 07：迁移 Vault 搜索/索引工具 | completed | 已迁移 `search_content` / `query_index` 到单工具目录，并将 `filesystemSearchHandlers.ts` 收敛为薄桥接 |
| Step 08：迁移 Vault 写入工具 | completed | 已迁移 `write_file` / `edit_file` 到单工具目录，并补校验、权限确认与动态风险钩子 |
| Step 09：迁移 Vault 破坏性工具 | completed | 已迁移 `move_path` / `delete_path` 到单工具目录，并接入默认确认流 |
| Step 10：迁移 Web 工具 | completed | 已迁移 `bing_search`、`fetch` 与两个 fetch wrapper 到单工具目录，并保留 legacy 薄桥接与抓取进度摘要 |
| Step 11：迁移 Script 工具 | completed | 已迁移 `run_script` / `run_shell` 到单工具目录，并补 shell 确认流、脚本执行摘要与 workflow 路由回归 |
| Step 12：迁移 Time 工具 | completed | 已迁移 `get_time` 与三个 time wrapper 到单工具目录，并把模式校验前移到 `validateInput()` |
| Step 13：迁移 Link / Plan / Skill 工具 | completed | 已迁移 `get_first_link_path`、`write_plan`、`discover_skills`、`invoke_skill` 到单工具目录，并保留 legacy 聚合入口与 Skill 特殊返回格式 |
| Step 14：surface 收敛、回归测试与非 BuiltinTool 收尾检查 | completed | 已将 discovery 蓝图收敛为 fallback / override / legacy bridge，并确认 `sub-agents` 仍保持独立 `ToolDefinition` 体系 |
| Step 15：新增 `ask_user` | completed | 已新增 workflow-only 的 `ask_user` 工具，并把用户澄清请求从 host 通道接线到各 provider 工具循环 |
| Step 16：新增 `append_daily_note` | completed | 已新增 daily note 原生写入工具，并在工具内部解析 `.obsidian/daily-notes.json` 与标题插入语义 |
| Step 17：新增 `property_edit` | completed | 已新增 frontmatter 结构化编辑工具，并复用 YAML 解析/序列化与属性类型转换逻辑 |
| Step 18：新增 `backlink_analyze` | completed | 已新增一跳图谱分析工具，并复用 metadata cache 的入链/出链关系来返回 incoming/outgoing/mutual/unresolved |
| Step 19：新增 `list_commands` + `run_command` | completed | 已新增 Obsidian 命令 discover/invoke 工具，并把命令执行确认收敛到权限流 |
| Step 20：新增 `list_mcp_resources` + `read_mcp_resource` | completed | 已新增 MCP 资源 discover/read 工具，并把资源只读链路接到 MCP runtime 与 builtin core tools |
| Step 21：新增 `read_canvas` + `edit_canvas` | completed | 已新增 Canvas 读写分离工具，并把结构化节点/位置/连线编辑接入 builtin core tools |
| Step 22：新增 `dataview_query` | completed | 已新增 Dataview 查询工具，并收敛可选插件检测 |
| Step 23：最终收口 | completed | 已补 architecture / ADR / release note，修复最终回归阻塞，并通过 lint / test / build |

## 当前约束

- 4 月 2 日 builtin route 的契约升级、执行器升级、surface 收敛、
  新增工具落地、Step 07 回补与文档收口现已全部完成；当前文档应反映的是
  “已实现范围 + 当前发布口径”，而不是继续保留历史上的临时遗留说明。
- 历史的 step-suffixed regression test 文件继续保留为路线图回归锚点，
  不视为需要在 Step 23 删除的 runtime legacy 标记。
- 当前 builtin 路线图范围内的旧工具迁移与新增工具接入都已落地；
  `search_content` / `query_index` 已进入各自单工具目录，
  `filesystemSearchHandlers.ts` 只剩兼容桥接注册与 `stat_path` legacy handler。
- Step 23 的工程验证已完成：
  - `npm run lint` 通过
  - `npm run test` 通过
  - `npm run build` 通过

## 下一步

- 路线图中的 Step 01 到 Step 23 现在都已完成。
- 下一步可以进入真实 Obsidian 手工 smoke test 与发布准备。
