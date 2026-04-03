# 2026-04-03 Skill 系统重构实施计划

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| 0. 架构蓝图与 Codex 执行文件落库 | completed | 已新增 blueprint、roadmap、playbook |
| 1. Skill manifest 与解析兼容升级 | completed | 已完成 Step 01 类型扩展与兼容解析 |
| 2. Source / Registry 主干落地 | completed | 已完成 Step 02-03，source 与 registry 已落地 |
| 3. 本地 Skill 管理能力落地 | completed | 已完成 Step 04，本地 CRUD 与启停写回已具备 |
| 3.5 服务桥接与监听收敛 | completed | 已完成 Step 05，旧 scanner 与 runtime 监听链已接入新主干 |
| 4. 设置页 Skill 管理 UI 落地 | completed | 已完成 Step 06-08，列表动作、编辑模态与创建表单已落地 |
| 5. Skill 会话态与执行器落地 | completed | 已完成 Step 09-10，会话状态基础与统一执行器已落地 |
| 6. slash command / invoke_skill 收敛 | completed | Step 11-12 已完成，共用执行主干 |
| 7. relevant resolver 与最终收口 | completed | 已完成 Step 13-14，Skill 收口已完成 |

## 2026-04-03 内置工具功能优化状态摘要

- 状态：已完成并通过 2026-04-03 复审。
- 当前实现：现有 builtin 工具已迁入新结构，直连执行入口统一走完整生命周期，
  alias/legacy bridge/surface 邻近元数据也已收口。
- 已落地新增工具：`ask_user`、`append_daily_note`、`property_edit`、
  `backlink_analyze`、`list_commands`、`run_command`、`list_mcp_resources`、
  `read_mcp_resource`、`read_canvas`、`edit_canvas`、`dataview_query`。
- 当前剩余动作不再是代码迁移，而是真实 Obsidian 手工 smoke test 与发布准备。

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

## 当前优先下一步

- Skill 系统重构路线图已在 Step 14 收尾完成。
- 如需继续推进，不应继续在当前 roadmap 内追加 Step；应先新建下一轮路线图，
  再进入新的 Step 01。
- 内置工具方向的后续工作只剩真实 Obsidian 手工 smoke test 与发布准备。

## 2026-04-03 Skill 系统重构收口摘要

- 已落地模块：
  - `src/domains/skills`：manifest 兼容解析、source / registry、CRUD、runtime filtering、execution、session-state
  - `src/components/skills` 与 `src/components/chat-components`：
    设置页列表动作、编辑模态、创建表单、slash 可执行 Skill 列表
  - `src/core/chat/services` 与 `src/tools/skill`：
    `/skill`、`invoke_skill`、discover/relevance prompt 注入、
    Skill 返回包写回
- 本轮修复收口：
  - 运行时默认忽略 disabled skill，设置页仍显示全部 Skill
  - `inline + allowed_tools` 已定为非法组合，并同步到 UI、执行器、spec、tests
  - Skill 相关 `tsc` 回归已清零；最新 `tsc` 日志只剩仓库无关基线错误
  - `lint:taste` 指定问题已清零：`saveSkillExecutionResult` 命名与非 barrel export 均已落地
- 验证口径：
  - `npx tsc --noEmit` 已执行；Skill 相关文件不再出现在最新日志中，
    但全仓仍有无关基线错误
  - 已执行命令：

    ```bash
    npm run lint:taste -- src/domains/skills src/components/skills \
      src/core/chat/services/chat-skill-execution.ts \
      src/core/chat/services/chat-commands.ts src/tools/skill
    npx tsx --test src/domains/skills/skills.test.ts \
      src/domains/skills/execution.test.ts \
      src/domains/skills/session-state.test.ts \
      src/core/chat/services/chat-skill-execution.test.ts \
      src/core/chat/services/chat-message-operations.test.ts \
      src/core/chat/services/chat-service-history-api.test.ts \
      src/components/chat-components/chatSettingsIntegrationTabs.test.tsx \
      src/components/skills/SkillEditorModal.test.tsx \
      src/components/skills/CreateSkillForm.test.tsx \
      src/tools/skill/skill-tools.test.ts
    npm run build
    ```

- 残余风险：
  - 全仓 `tsc` 仍有与 Skill 无关的基线错误，需要独立治理
  - 真实 Obsidian smoke checklist 仍需人工执行，本轮未伪造结果
  - `inline` 仍不支持 `allowed_tools` 白名单，这是本轮刻意保留的兼容边界
- 推荐下一步：
  - 不再在当前 roadmap 内继续补 Step；若继续推进 Skill，先新建下一轮 roadmap
  - 并在新一轮中优先选择“清理无关全局 TypeScript 基线”或“执行真实 Obsidian smoke”之一
