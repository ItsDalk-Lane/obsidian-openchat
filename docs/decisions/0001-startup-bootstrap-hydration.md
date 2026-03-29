# ADR 0001: Settings 启动链路拆分为 Bootstrap + Hydration

## 状态

已接受

## 背景

此前 `main.ts` 会在 `onload()` 中直接等待完整 settings load 链路。
这条链路不仅读取 `data.json` 与解密运行时配置，还会继续触发：

- 默认系统提示词迁移
- MCP Markdown 服务器读取
- 与 AI 数据目录相关的后续整理

这违反了黄金原则里“`onload()` 只做注册”的约束，也让启动时延与布局恢复更容易被历史数据量放大。

## 决策

- `SettingsDomainService` 拆成两段接口：
  - `loadBootstrapSettings()`：只负责读取持久化设置、解密运行时配置、裁剪 legacy 字段、返回可用于注册的基础快照
  - `hydratePersistedSettings()`：负责补齐系统提示词迁移与 MCP Markdown 配置
- `PluginStartupCoordinator` 接管启动编排：
  - `onload()` 期间只触发 bootstrap，不等待完整 hydrate
  - `onLayoutReady` 后执行 deferred initialization，包括目录整理、legacy 清理、hydrate 与 MCP 初始化
- `main.ts` 保持为组合根薄壳，只负责注册和依赖注入

## 后果

### 正向

- 启动主路径更短，`onload()` 更接近“只做注册”
- settings 副作用被显式分层，后续更容易测试与迁移
- bootstrap settings 可以先驱动命令注册与默认 UI，再在 deferred 阶段补齐完整运行时

### 代价

- 启动状态从单阶段变成两阶段，调用方必须接受“先 bootstrap、后 hydrate”的现实
- settings 保存前必须确保 bootstrap 已完成，避免默认值覆盖持久化配置
- 文档与测试需要同步到新的两段式语义

## 后续工作

- 继续把 chat / editor / quick-actions 的宿主能力收敛到更小的 host adapter
- 扩大机械化护栏覆盖范围，让全仓都能验证“不在 `onload()` 做重工作”
