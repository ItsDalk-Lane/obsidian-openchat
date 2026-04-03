# 2026-04-03 Skill 系统重构修复复查

## 目标与范围

- 目标：对已完成的 Skill 重构 Step 01-14 做修复收口。
- 目标：只处理本轮明确指定的问题，并在结束前完成逐项复查。
- 范围：仅限 Skill 重构相关模块、直接调用链、直接测试。
- 范围：包含 planning files 收口。
- 非范围：不扩散到无关模块。
- 非范围：不手动编辑生成产物。
- 非范围：不改变既有对外入口与 legacy `SKILL.md` 兼容语义。

## 修复检查清单

### 1. 禁用 Skill 运行时语义

- 目标：设置页继续显示全部 Skill。
- 目标：运行时默认忽略 `enabled: false`。
- 目标：relevant resolver 不再执行禁用 Skill。
- 目标：`/skill` 与 `invoke_skill` 不再执行禁用 Skill。
- 状态：passed
- 备注：已补运行时过滤、显式禁用失败结果与回归测试。

### 2. `allowed_tools` 语义一致化

- 目标：消除 `inline` 与 `isolated` 路径语义分叉。
- 目标：实现、spec、测试三者一致。
- 状态：passed
- 备注：已确定兼容策略为“禁止 `inline + allowed_tools`”。

### 3. Skill 重构相关 TypeScript 错误清零

- 目标：清理指定 Skill 重构文件的 `tsc` 报错。
- 目标：若仍有无关基线错误，需单独列明。
- 状态：passed
- 备注：最新 `tsc` 日志已不再包含指定 Skill 文件。
- 备注：全仓仍有无关基线错误。

### 4. `lint:taste` 违规清零

- 目标：修复 `chat-message-operations.ts` 的 side-effect naming。
- 目标：移除 `service.ts` 的 barrel export。
- 状态：passed
- 备注：`saveSkillExecutionResult` 命名与非 barrel export 已落地。

### 5. 验证链补齐

- 目标：记录 `tsc`、定向 `lint:taste`、定向测试的结论。
- 目标：记录 `npm run build` 的结论。
- 状态：passed
- 备注：命令已全部执行并记录。

### 6. planning files 压缩

- 目标：压缩 `task_plan.md`、`findings.md`、`progress.md`。
- 目标：保留可继续接手的收口摘要。
- 状态：passed
- 备注：已压缩为收口摘要，保留无关任务记录。

## 本轮发现的问题清单

- 初始已知问题：禁用 Skill 仅写回 frontmatter。
- 初始已知问题：runtime 查询与执行路径未统一过滤。
- 初始已知问题：`allowed_tools` 只在 `isolated` 生效。
- 初始已知问题：`inline` 路径存在半实现状态。
- 实际补查问题：Skill 相关 adapter / test fixture 存在类型漂移。
- 实际补查问题：`tsc` 日志继续出现 `ChatSettingsContext`。
- 实际补查问题：`tsc` 日志继续出现 `document.ts`。
- 实际补查问题：`tsc` 日志继续出现 provider message tests。
- 实际补查问题：`tsc` 日志继续出现 state-api tests。
- 初始已知问题：存在 `lint:taste` 违规。
- 初始已知问题：本轮只允许修复 Skill 重构相关问题。

## 修复清单

- 在 `SkillScannerService` / `SkillRegistry` 增加运行时过滤入口。
- 让 relevant resolver 默认忽略禁用 Skill。
- 让 `discover_skills` 默认忽略禁用 Skill。
- 让 slash 可执行 Skill 列表默认忽略禁用 Skill。
- 让 `/skill` 与 `invoke_skill` 默认忽略禁用 Skill。
- 在 `SkillExecutionService` 明确拒绝 `inline + allowed_tools`。
- 在 `SkillEditorModal` 明确拒绝 `inline + allowed_tools`。
- 在 `CreateSkillForm` 明确拒绝 `inline + allowed_tools`。
- 同步更新 `skills.spec.md` 与回归测试。
- 修复 `useSkillSettingsController.tsx` 的 Skill 相关 `tsc` 回归。
- 修复 `document.ts`、`source.ts` 的 Skill 相关 `tsc` 回归。
- 修复 `session-state.test.ts`、`skills.test.ts` 的 `tsc` 回归。
- 修复直接关联的 provider message / state / test 类型链。
- 将 `applySkillExecutionResult` 重命名为 `saveSkillExecutionResult`。
- 移除 `src/domains/skills/service.ts` 中的 barrel export。
- 压缩 `task_plan.md`、`findings.md`、`progress.md` 的 Step 01-14 过程记录。

## 验证记录

### 1. `npx tsc --noEmit`

- 结果：failed on unrelated baseline
- 结论：命令已执行。
- 无关错误仍包括 `infra/lint-arch.ts`。
- 无关错误仍包括 `infra/lint-taste.ts`。
- 无关错误仍包括 `src/commands/ai-runtime/AiRuntimeCommandManager.ts`。
- 无关错误仍包括 `src/components/chat-components/chatInputAttachmentSources.ts`。
- 无关错误仍包括 `src/components/settings-components/ModelSettingsTabItem.tsx`。
- 无关错误仍包括 `src/components/settings-components/provider-config/panelRenderBridge.ts`。
- 指定 Skill 文件与本轮 Skill 相关文件集合已不再出现在日志中。
- `get_errors` 对以下文件返回 0 错误：
- `src/components/skills/useSkillSettingsController.tsx`
- `src/domains/skills/document.ts`
- `src/domains/skills/source.ts`
- `src/domains/skills/session-state.test.ts`
- `src/domains/skills/skills.test.ts`

### 2. 定向 `lint:taste`

- 结果：passed
- 命令：

```bash
npm run lint:taste -- src/domains/skills src/components/skills \
  src/core/chat/services/chat-skill-execution.ts \
  src/core/chat/services/chat-commands.ts src/tools/skill
```

- 结论：`lint:taste: 0 violations`。

### 3. 定向测试

- 结果：passed
- 命令：

```bash
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
```

- 结论：64/64 通过。

### 4. `npm run build`

- 结果：passed
- 结论：构建、归档与 vault sync 完成。

## 逐项复查结果

### 复查 1. 禁用 Skill 运行时语义

- 结果：passed
- 复查结论：设置页仍显示全量 Skill。
- 复查结论：运行时 discover / relevant / slash / invoke 已默认过滤禁用 Skill。
- 复查结论：禁用执行会返回稳定失败结果。

### 复查 2. `allowed_tools` 语义一致化

- 结果：passed
- 复查结论：本轮采纳“禁止 `inline + allowed_tools`”策略。
- 复查结论：UI、执行器、spec、回归测试已一致。

### 复查 3. Skill 重构相关 TypeScript 错误清零

- 结果：passed
- 复查结论：指定 Skill 文件已从最新 `tsc` 日志中清零。
- 复查结论：本轮 Skill 相关文件集合也已清零。
- 复查结论：仅剩仓库无关全局基线错误。

### 复查 4. `lint:taste` 违规清零

- 结果：passed
- 复查结论：side-effect 命名问题已消失。
- 复查结论：barrel export 问题已消失。

### 复查 5. 验证链补齐

- 结果：passed
- 复查结论：`tsc` 已执行并记录。
- 复查结论：定向 `lint:taste` 已执行并记录。
- 复查结论：定向测试已执行并记录。
- 复查结论：`build` 已执行并记录。

### 复查 6. planning files 压缩

- 结果：passed
- 复查结论：Step 01-14 长过程记录已压缩为 handoff 摘要。
- 复查结论：无关任务与后续接手信息已保留。

## 最终结论

- 本轮要求的 Skill 收口事项已全部通过复查。
- 仍有残余问题，但均不属于本轮 Skill 修复范围。
- 全仓 `tsc` 基线错误尚未清理。
- 真实 Obsidian smoke checklist 仍需人工执行。
- 本轮未手动编辑生成产物。
- `build` 产生的归档与 vault sync 为验证链正常副作用。

## planning files 压缩结果

- `task_plan.md` 已压缩为单一收口摘要。
- `task_plan.md` 保留了无关任务状态表与下一步提示。
- `findings.md` 已压缩为收口级观察。
- `findings.md` 保留了内置工具复审与聊天域清理结论。
- `progress.md` 已压缩为 landed modules / 验证结果摘要。
- `progress.md` 保留了残余风险、建议下一步与 2026-03-31 历史记录。
