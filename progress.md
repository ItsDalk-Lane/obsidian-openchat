# 会话进度

## 2026-04-03

- Skill 系统重构 Step 01-14 已完成收口。
- landed modules：
  - `src/domains/skills`：manifest、source / registry、CRUD、execution、session-state
  - `src/components/skills` 与 `src/components/chat-components`：
    设置页管理 UI 与 slash 可执行 Skill 列表
  - `src/core/chat/services` 与 `src/tools/skill`：`/skill`、
    `invoke_skill`、relevant resolver、Skill 返回包写回
- 本轮收口修复：
  - 运行时默认忽略 disabled skill，设置页仍保留全量展示
  - `inline + allowed_tools` 已统一为非法组合，并同步到 UI、执行器、spec、tests
  - Skill 相关 `tsc` 回归已清零；最新 `tsc` 日志只剩无关全局基线错误
  - `lint:taste` 指定问题已清零；定向测试与 build 已重跑通过
- 本轮验证：
  - `npx tsc --noEmit` 已执行，Skill 相关文件不再出现在日志中
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
  - 全仓 `tsc` 仍有无关基线错误，需要独立清理
  - 真实 Obsidian smoke checklist 仍需人工执行
  - `inline` 不支持 `allowed_tools` 为刻意保留的兼容边界
- 推荐下一步：
  - 如需继续推进 Skill，不再延续当前 roadmap Step 编号，而是新建下一轮 roadmap
  - 并优先在“清理全局 TypeScript 基线”与“执行真实 Obsidian smoke”之间二选一
- 内置工具功能优化已完成并通过复审：
  - 现有 builtin 工具已迁入新结构
  - 统一了 validate / permission / confirmation / output validation /
    serialization 执行链
  - alias、legacy bridge、surface 邻近元数据已收口
  - `ask_user`、`append_daily_note`、`property_edit`、`backlink_analyze`、
    `list_commands`、`run_command`、`list_mcp_resources`、`read_mcp_resource`、
    `read_canvas`、`edit_canvas`、`dataview_query` 已落地
- 本轮复审验证通过：
  - `npm run lint:taste`
  - `npm run test:chat-core`
  - `npm run test:tool-migration`
  - `npm run test`
- 内置工具方向当前只剩真实 Obsidian 手工 smoke test 与发布准备。

## 2026-03-31

- 已完成聊天域清理与兼容收口，包括：
  - 删除无引用的 Slash Command / MCP 模式残留
  - 清理模板系统提示词与旧设置残留字段
  - 保留仍有真实调用的多模型主链
- 当轮验证已通过：
  - `npm run test:chat-core`
  - `npm run test:domains`
  - `npm run lint:arch`
  - `npm run lint:taste`
  - `npm run build`
