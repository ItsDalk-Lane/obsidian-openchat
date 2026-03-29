<!-- markdownlint-disable MD013 -->
# docs/quality-grades.md — 质量评分

## 评分标准

| 等级 | 含义                                       |
| ---- | ------------------------------------------ |
| A    | 完全符合所有黄金原则，测试充分，文档完整   |
| B    | 基本符合，有小的改进空间                   |
| C    | 存在明显的技术债，需要安排清理             |
| D    | 严重偏离原则，需要优先重构                 |

## Provider 层评分

| 组件 | 评分 | 日期 | 备注 |
| ---- | ---- | ---- | ---- |
| providers.types.ts | A | 2026-03-30 | 拆分为 13 个窄端口，`ObsidianApiProvider` 保留为 deprecated 兼容层 |
| obsidian-api.ts | B | 2026-03-30 | 实现无变化，类型侧已满足窄端口契约 |

## 域评分

| 域     | 架构 | 测试 | 文档 | 评分 | 日期       | 备注                               |
| ------ | ---- | ---- | ---- | ---- | ---------- | ---------------------------------- |
| chat | B+ | B | A | B+ | 2026-03-29 | 迁移阶段一已完成：types（4 文件）/ config / service（14 文件）/ ui（4 文件）四层齐备，依赖方向合规。已迁入共享类型、默认配置、pinned 检测、图片意图、plan prompt、历史解析/格式化/摘要、context compaction、provider message 纯 helper、附件选择、状态存储、view coordinator 与 Markdown 渲染。5 个测试文件（~1123 行）覆盖已迁入 service 逻辑；spec 含 13 条行为规格。legacy 残留：会话生命周期与生成主链路仍在 core/chat/services/，ChatFeatureManager 仍为 legacy 组合根；commands/chat/ 与 core/chat/utils/markdown.ts 已降级为纯 re-export shim |
| editor | A    | B    | B    | B+   | 2026-03-30 | 窄端口迁移完成（NoticePort & SystemPromptPort），命令层保留 legacy |
| quick-actions | A | A- | A- | A | 2026-03-29 | 窄端口迁移完成（QuickActionDataHostPort / QuickActionExecutionHostPort），`service-data.ts` / `service-execution.ts` 以 typed Result 建模可预期错误；settings/editor 主路径已直接消费 Result-first 入口，兼容异常仅保留给 legacy public API |
| skills | A    | B    | B    | B+   | 2026-03-30 | 窄端口迁移完成（SkillScannerHostPort / SkillsRuntimeHostPort），测试 fake 已瘦身 |
| settings | A | A- | A- | A | 2026-03-29 | service 层完全通过端口注入解耦，不再持有 app/plugin 引用。AiRuntimeSettings 真源已迁入 `domains/settings/types-ai-runtime.ts` / `config-ai-runtime.ts` / `config-ai-runtime-vendors.ts`；`src/settings/ai-runtime/core.ts` / `api.ts` / `settings.ts` 已降级为纯 shim，仓库内部生产代码已直接依赖域内真源 |
| mcp | B    | B    | B    | B    | 2026-03-28 | 外部运行时完整迁入 domains，legacy 仅保留配置 UI 与 tool loop 适配 |

## 基础设施评分

| 组件         | 评分 | 备注                                             |
| ------------ | ---- | ------------------------------------------------ |
| lint-arch    | B    | 已扩到 `src + infra` 全仓，显式分类替代 catch-all consumer，并新增 shim / runtime-adapter / tool 边界；新增 chat-assembler / ai-runtime-assembler / feature-query-facade 为 module/root |
| lint-taste   | B    | 已对全仓生产代码执行 `max-lines` / `any` / `console` / `barrel` / `folder-import`，兼容 shim 走显式例外 |
| 测试基础设施 | B    | CI 运行 lint/test/build，集成回归偏少            |
| 文档新鲜度   | A-   | FeatureCoordinator 拆分、启动链路、ai-runtime shim 状态、内部 consumer 迁移完成情况与 quick-actions Result-first 语义已同步；chat 域已纳入质量评分覆盖 |

## 组合根评分

| 组件 | 评分 | 日期 | 备注 |
| ---- | ---- | ---- | ---- |
| FeatureCoordinator | B+ | 2026-03-29 | 已拆分为薄编排入口 + ChatAssembler + AiRuntimeAssembler + FeatureQueryFacade，职责清晰 |
| ChatAssembler | B+ | 2026-03-29 | 承接 ChatConsumerHost 构建、早期视图注册与 ChatFeatureManager 生命周期 |
| AiRuntimeAssembler | A | 2026-03-29 | 职责单一：AiRuntimeCommandHost 构建与 AiRuntimeCommandManager 生命周期 |
| FeatureQueryFacade | A | 2026-03-29 | 纯查询转发 + ToolExecutorRegistry，无初始化逻辑 |

---

> 此文件由垃圾回收流程定期更新。
> 当评分下降时应自动被发现，而不是等人类在季度回顾时才注意到。
