# 审计发现记录

## 2026-04-03 Skill 系统重构收口发现

- Skill 收口阶段的关键不是继续扩功能，而是把 Step 01-14 已落地的兼容语义固定成稳定边界：
  legacy `SKILL.md` 兼容、disabled skill 运行时过滤、`/skill` 与 `invoke_skill` 共用执行主干、
  canonical `discover_skills` / `invoke_skill` 与 legacy `Skill` alias 并存。
- 本轮最值得锁定的收口点有两个：
  - runtime 与 settings 必须分离语义，设置页保留全量，运行时默认只看 enabled skill；
  - `inline + allowed_tools` 不能继续半实现，必须统一改成显式非法组合。
- Step 01-14 的 landed modules 已经稳定落在三条主线上：
  - `src/domains/skills`：manifest、source / registry、CRUD、execution、session-state
  - `src/components/skills` / `src/components/chat-components`：
    Skill 管理 UI 与 slash 可执行列表
  - `src/core/chat/services` / `src/tools/skill`：slash command、
    invoke tool、relevant resolver、返回包写回
- 本轮新增的类型修复说明：Skill 相关文件与其直接测试夹具原本仍有一批 `tsc` 回归；
  现已清零，最新全仓 `tsc` 只剩无关基线问题。
- 残余风险仍有两类：
  - 全仓 `tsc` 无关基线错误尚未独立治理
  - 真实 Obsidian smoke checklist 仍需人工执行，当前不能把自动测试当成替代品
- 建议下一步：不要继续往当前 Skill roadmap 追加 Step；若还要推进，先新建下一轮 roadmap，
  再明确是优先清理全局基线，还是优先执行真实 Obsidian smoke。

- Skill 重构当前最重要的是先固定目标架构，而不是先做 UI。
- 适合继续沿用 `task_plan.md`、`findings.md`、`progress.md` 的文件式推进方式。
- 本轮已沉淀三份固定入口文档：
  - `docs/designs/2026-04-03-skill-system-architecture-blueprint.md`
  - `docs/designs/2026-04-03-skill-system-codex-roadmap.md`
  - `docs/designs/2026-04-03-skill-system-codex-playbook.md`
- 后续实现的主线应保持：
  - 先本地 source / registry，再做管理与 UI
  - 默认执行模式为 `isolated_resume`
  - 主任务与 Skill 子执行通过 `MainTaskFrame` / `SkillReturnPacket` 隔离与恢复

## 2026-04-03 内置工具功能优化复审结论

- 本轮复审未发现新的开放问题。
- 当前实现已经兑现本轮目标：
  - 现有 builtin 工具已迁入新结构，并保留必要的 legacy bridge
  - builtin 直连执行入口统一走完整生命周期
  - alias canonical 化与 discovery compatibility 已统一
  - central builtin surface preset 已收敛为 fallback / non-builtin 例外层
  - 路线图新增工具已全部接入 builtin runtime
- 本轮复审验证通过：
  - `npm run lint:taste`
  - `npm run test:chat-core`
  - `npm run test:tool-migration`
  - `npm run test`
- 当前仅剩手工验证风险：尚未在真实 Obsidian 环境做 smoke test。

## 2026-03-31 聊天域清理关键发现

- 多模型对比链路仍有真实调用，不能把相关模块整体视为冗余删除。
- 模板系统提示词与部分 Slash Command 残留字段已脱离运行时主链，可清理。
- `McpModeSelector.tsx` 及其三模式状态链曾存在前后端失配，已在当轮清理中收敛。
- 该类聊天域清理需要持续遵守：
  - 不覆盖工作树中的用户改动
  - 优先保留兼容 shim 与真实调用链
  - 以测试、lint、build 作为最终验收口径
