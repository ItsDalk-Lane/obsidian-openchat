# MCP Runtime Domain Design

## 目标

本轮第四个样板域迁移“外部 MCP 运行时”完整闭环，但不迁移整个 MCP 子系统。

## 本轮边界

迁入 domains/mcp 的内容：

- 共享 MCP 类型真相
- 外部 MCP runtime 默认配置与归一化
- 运行时初始化、更新、释放的 service/ui 边界
- client / process / health-check / protocol client 内核
- stdio / http / websocket / remote-sse transport
- SSE parser 与 tool result serializer 的域内本地化实现
- FeatureCoordinator、ChatService、设置面板对外部 MCP runtime 的统一消费接口

保留在 legacy 的内容：

- MCP Markdown 配置持久化
- 设置 Modal / JSON 导入
- tool loop 适配与 ToolExecutor

## 为什么这样切

- settings 域已经接管了生命周期与配置装配，第四域最小闭环应聚焦 runtime。
- 外部 MCP runtime 已在 FeatureCoordinator 中形成独立初始化入口，便于先抽象消费边界。
- 若把 Markdown 持久化、设置 UI、tool loop 适配一起并入，会提前撞上 chat 域复杂度。

## 兼容策略

- src/domains/mcp/types.ts 成为共享类型真相。
- src/types/mcp.ts 与 src/services/mcp/types.ts 保留为兼容性 re-export 入口。
- src/services/mcp/index.ts 继续作为 legacy 聚合入口，但不再持有 runtime core。
- requestUrl 能力通过 providers/obsidian-api.ts 的 requestHttp() 注入到 mcp 域。

## 后续迁移方向

下一步若继续清理 mcp legacy，优先顺序应为：

1. 评估 McpServerDataService 是否应并入 settings 域的 MCP 持久化边界
2. 评估 McpConfigModals / importer 是否拆入 settings UI 边界
3. 最后再考虑 tool loop 适配是否进一步下沉到 chat 或 tools/runtime
