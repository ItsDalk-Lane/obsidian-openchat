## 2026-04-03 Skill 系统重构实施计划

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| 0. 架构蓝图与 Codex 执行文件落库 | completed | 已新增 skill 重构 blueprint、roadmap、playbook，后续实现按单 Step 对话推进 |
| 1. Skill manifest 与解析兼容升级 | pending | 目标是引入新 frontmatter 结构与默认值，但保持旧 `SKILL.md` 兼容 |
| 2. Source / Registry 主干落地 | pending | 目标是只保留本地来源实现，但抽象出可扩展来源接口与统一快照 |
| 3. 本地 Skill 管理能力落地 | pending | 目标是支持创建、更新、删除、启用/禁用，并作为设置页操作基础 |
| 4. 设置页 Skill 管理 UI 落地 | pending | 目标是在保留简洁列表的前提下接入编辑、删除、启停、创建表单 |
| 5. Skill 会话态与执行器落地 | pending | 目标是实现 `isolated_resume` 主任务恢复模型与统一执行主链 |
| 6. slash command / invoke_skill 收敛 | pending | 目标是让两条入口共用同一 SkillExecutionService |
| 7. relevant resolver 与最终收口 | pending | 目标是收敛相关 Skill 注入、测试、文档与手工验证清单 |

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

- Skill 系统重构后续应按
  `docs/designs/2026-04-03-skill-system-codex-roadmap.md`
  的 Step 01 开始执行。
- 内置工具方向的后续工作只剩真实 Obsidian 手工 smoke test 与发布准备。
