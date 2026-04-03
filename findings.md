# 审计发现记录

## 2026-04-03 Skill 系统重构设计发现

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
