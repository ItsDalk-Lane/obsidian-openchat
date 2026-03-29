# Legacy 类型域化迁移计划

## 当前状态

AiRuntimeSettings 与 ChatSettings 的仓库内主路径迁移已完成：

- 真实类型：`src/domains/settings/types-ai-runtime.ts`
- 默认值与归一化：`src/domains/settings/config-ai-runtime.ts`
- vendor registry / APP_FOLDER：`src/domains/settings/config-ai-runtime-vendors.ts`
- 兼容出口：`src/settings/ai-runtime/core.ts`、
  `src/settings/ai-runtime/api.ts`、
  `src/settings/ai-runtime/settings.ts`（纯 shim）
- `ChatSettings` / `QuickAction` / `ChatMessage` 等共享结构：
  `src/domains/chat/types.ts`、`src/domains/chat/config.ts`、`src/domains/chat/service.ts`
- 兼容出口：`src/types/chat.ts`（纯 shim）

当前剩余的 legacy 全局真源如下：

| 类型 | 当前 legacy 入口 | 真实归属/状态 | 消费者数量 |
| --- | --- | --- | --- |
| `AiRuntimeSettings` 相关 | `src/settings/ai-runtime/*.ts` | 已由 `src/domains/settings/*` 拥有，legacy 入口为纯 shim | 仓库内部生产代码 0，兼容测试若干 |
| `ChatSettings` 及相关 | `src/types/chat.ts` | 已由 `src/domains/chat/types.ts` / `config.ts` / `service.ts` 拥有，legacy 入口为纯 shim | 仓库内部生产代码 0，兼容测试若干 |
| `Message`、`ProviderSettings`、`Vendor` | `src/types/provider.ts` | 仍为 legacy 全局真源 | ~40+ |

## 迁移目标

| 类型 | 最终归属域 |
| --- | --- |
| `AiRuntimeSettings` 及相关 | 已完成：`domains/settings/types-ai-runtime.ts` + `config-ai-runtime.ts` |
| `ChatSettings` 及相关 | `domains/chat/types.ts`（内联定义） |
| `Message`、`ProviderSettings`、`Vendor` | `providers/providers.types.ts`（跨域共享契约） |

settings 域的 `PluginSettings` 聚合接口现已直接引用本域
`types-ai-runtime.ts`，chat/settings/commands/components/editor/tools 的内部消费方
已按边界分流：组件、编辑器、命令层与 core 统一通过 domains 真源引用；
无法跨域直连的域文件继续通过 `src/types/chat.ts` 这个纯 shim 共享 chat 契约。
旧路径本身不再承载真实实现，只保留兼容职责。

## 迁移前置条件

1. Finding #3（quick-actions service-execution.ts 端口注入）完成后，
   `Message`/`ProviderSettings`/`Vendor` 的域内直接消费减少
2. settings UI 面板从 legacy `src/settings/` 迁入 `domains/settings/ui.ts`
3. provider 共享类型的最终归属方案确认

## 风险评估

| 风险 | 级别 | 缓解 |
| --- | --- | --- |
| 迁移中断导致两份类型定义并存 | 低 | 旧路径仅保留 shim，真实实现只允许存在于 domains 真源 |
| 跨域共享类型（Message 等）归属争议 | 低 | 遵循"被多域消费的类型归 providers"原则 |

## 后续执行顺序

1. 维护 `src/settings/ai-runtime/*` 与 `src/types/chat.ts` 纯 shim 状态，防止回流业务逻辑
2. 继续迁移 `Message`/`ProviderSettings`/`Vendor` → `providers/providers.types.ts`
3. settings UI 如果进一步域化，再评估是否补建 `domains/settings/ui.ts`
4. 每批迁移后运行 `npm run lint && npm run test && npm run build` 验证
