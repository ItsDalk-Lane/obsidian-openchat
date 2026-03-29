<!-- markdownlint-disable MD013 -->
# docs/quality-grades.md — 质量评分

## 评分标准

| 等级 | 含义                                       |
| ---- | ------------------------------------------ |
| A    | 完全符合所有黄金原则，测试充分，文档完整   |
| B    | 基本符合，有小的改进空间                   |
| C    | 存在明显的技术债，需要安排清理             |
| D    | 严重偏离原则，需要优先重构                 |

## 域评分

| 域     | 架构 | 测试 | 文档 | 评分 | 日期       | 备注                               |
| ------ | ---- | ---- | ---- | ---- | ---------- | ---------------------------------- |
| editor | B    | B    | B    | B    | 2026-03-28 | 样板域迁移完成，命令层保留 legacy  |
| quick-actions | B | B | B | B | 2026-03-29 | 核心持久化与执行已迁入 domains，editor/settings 旧路径保留 shim 或 host adapter |
| skills | B    | B    | B    | B    | 2026-03-28 | 迁入 domains，依赖 aiDataFolder    |
| settings | B    | C    | B    | B    | 2026-03-29 | 生命周期已迁入 domains，quick-actions 面板通知与数据读写已改走 provider/host，迁移与 secret 仍依赖 legacy 服务 |
| mcp | B    | B    | B    | B    | 2026-03-28 | 外部运行时完整迁入 domains，legacy 仅保留配置 UI 与 tool loop 适配 |

## 基础设施评分

| 组件         | 评分 | 备注                                             |
| ------------ | ---- | ------------------------------------------------ |
| lint-arch    | B    | 已扩到 `src + infra` 全仓，显式分类替代 catch-all consumer，并新增 shim / runtime-adapter / tool 边界 |
| lint-taste   | B    | 已对全仓生产代码执行 `max-lines` / `any` / `console` / `barrel` / `folder-import`，兼容 shim 走显式例外 |
| 测试基础设施 | B    | CI 运行 lint/test/build，集成回归偏少            |
| 文档新鲜度   | B    | 启动链路、chat host adapter 与 cleanup 入口已同步，仍需持续清理 legacy 漂移 |

---

> 此文件由垃圾回收流程定期更新。
> 当评分下降时应自动被发现，而不是等人类在季度回顾时才注意到。
