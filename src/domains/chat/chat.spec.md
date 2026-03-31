# chat 行为规格

## 概述

chat 域当前处于迁移第一阶段，已经承接共享类型、默认配置、图片意图识别、
live plan prompt 组装、历史消息解析、历史消息格式化、历史摘要、
context compaction、provider message 纯 helper、文件意图分析、
附件选择与状态存储等纯辅助逻辑。

当前仍保留在 legacy 的内容：

- 会话生命周期与消息生成主链路
- 历史持久化与多模型配置监听
- Chat 视图组件、模态框组件与编辑器集成
- MCP、skills、sub-agent 与 command 层装配

当前已迁入 domain UI 接缝的内容：

- `ui-view-coordinator.ts`：chat 视图激活、sidebar/window/tab 切换
- `ui-view-coordinator-support.ts`：chat 命令注册
- `ui-markdown.ts`：Markdown 渲染与内部链接打开，统一经 `ObsidianApiProvider`

当前保留在 plugin 入口层的内容：

- `main.ts`：在 onload 中单次注册 AI Chat ribbon，并委托协调器激活视图

## 核心行为

### 行为 1：提供稳定的共享类型与默认设置

- 触发条件：consumer 读取 chat 域导出的设置类型、会话类型或默认值。
- 预期结果：默认值与当前受支持的 chat 行为保持一致，不引入已废弃的自动活跃文件配置字段。
- 边界情况：
  - 当 messageManagement 配置缺失时，应回退到默认 recentTurns 与 enabled 值。
  - 当 summaryModelTag 为空白字符串时，应规范化为 undefined。

### 行为 2：识别已置顶消息

- 触发条件：consumer 调用 isPinnedChatMessage。
- 预期结果：只有 metadata.pinned === true 时返回 true。
- 边界情况：
  - 当消息为 null 或 undefined 时返回 false。
  - 当 metadata 缺失时返回 false。

### 行为 3：识别图片生成意图

- 触发条件：consumer 调用 detectImageGenerationIntent 检测用户输入。
- 预期结果：明确的图片生成请求返回 true，明显是计划、代码、文档等非图片请求返回 false。
- 边界情况：
  - 当内容为空字符串时返回 false。
  - 当语句既包含生成动词又紧跟非图片词时，应避免误判。

### 行为 4：归一化模态框尺寸

- 触发条件：consumer 调用 resolveChatModalDimensions。
- 预期结果：当设置缺失时，返回 chat 域默认宽高。
- 边界情况：
  - 当仅提供宽度或高度之一时，另一项应回退到默认值。

### 行为 5：组装 live plan 提示上下文

- 触发条件：consumer 调用 buildLivePlanGuidance 或 buildLivePlanUserContext。
- 预期结果：当 livePlan 有任务时，输出保持任务顺序的提示文本，并优先突出 in_progress
  任务，其次才是 todo。
- 边界情况：
  - 当 livePlan 为空或任务数为 0 时，返回 null。

### 行为 6：从历史文本恢复工具调用与 sub-agent 状态

- 触发条件：consumer 解析持久化后的 chat 历史文本。
- 预期结果：工具 callout、reasoning callout 与 sub-agent quote block 能被恢复为
  chat 域可消费的结构化数据，同时保留非结构化正文。
- 边界情况：
  - 当历史文本不包含对应标记时，应原样返回。
  - 当工具调用包含代码块时，应保留原始 content 文本。

### 行为 7：分析文件在提示词中的预期角色

- 触发条件：consumer 调用 FileIntentAnalyzer 分析模板。
- 预期结果：角色定义、处理指令或显式文件引用应被识别为 processing_target；
  示例模板识别为 example；其余回退为 reference。
- 边界情况：
  - 当模板为空字符串时，返回 low 置信度的 reference。

### 行为 8：维护可订阅的 chat 状态快照

- 触发条件：consumer 通过 ChatStateStore 读取、订阅或批量更新状态。
- 预期结果：公开快照必须是克隆值，updateBatch 只 emit 一次，底层 mutable state
  仅在 store 内部持有。
- 边界情况：
  - 当订阅建立时，应立即收到当前快照。
  - 当 dispose 后，不再保留旧订阅者。

### 行为 9：维护附件选择快照与显式文件选择逻辑

- 触发条件：consumer 通过附件选择服务添加文件/文件夹，或从 session 快照恢复已选附件。
- 预期结果：附件选择快照可克隆恢复；显式添加的文件会去重；恢复旧 session 时会清理已废弃的
  `isAutoAdded` 等遗留字段，只保留当前稳定类型字段。
- 边界情况：
  - 当重复添加同一路径文件时，不应重复插入。
  - 当 session 附件里带有历史遗留字段时，恢复后不应继续保留这些字段。

### 行为 10：在输入框中通过 `@` 统一触发模板、文件与附件入口

- 触发条件：consumer 在 chat 输入框中输入 `@`，且触发符位于行首或前一个字符为空格/换行。
- 预期结果：
  - 当 `@` 后没有搜索文本时，弹出与 `/` 命令一致的浮动选择菜单，依次显示“提示模板”、“上传文件”、
    “上传图片”三个操作项，以及当前活跃文件的 `Active` 选项。
  - 选中“提示模板”后，关闭 `@` 菜单，并在 `@` 符号锚点位置打开一个小型模板下拉菜单；该菜单列出
    AI prompts 目录下所有 `.md` 模板，支持搜索、上下箭头导航、Enter/Tab 选择与 Escape 关闭；选中后
    直接调用 `selectPromptTemplate()` 应用模板。
  - 选中“上传文件”后，关闭 `@` 菜单，并在同一锚点位置打开 `FileMenuPopup`；用户可以继续选择文件或
    文件夹作为普通手动附件。
  - 选中“上传图片”后，关闭 `@` 菜单并触发原生图片文件选择器；所选图片会转成 base64 后加入
    selectedImages。
  - 当 `@` 后输入搜索文本时，空态操作项会被替换为模板、文件夹、文件的搜索结果；匹配维度包括名称与
    描述，排序优先级固定为模板 > 文件夹 > 文件；选中模板会应用模板，选中文件或文件夹会添加附件。
  - 无论选择哪一类 `@` 条目，输入框中的本次 `@token` 都会被移除。
- 边界情况：
  - 当没有活跃文件时，空查询菜单不显示 `Active` 项，但仍显示三个操作项。
  - 当 `@` 前一个字符不是空格/换行/行首时，不应触发菜单。
  - 当搜索没有匹配结果时，应显示专用的“无匹配”提示，而不是自动关闭菜单。
  - 当 `@` 菜单已经被用户显式关闭且输入值未变化时，不应立即重复弹出。
  - 当打开模板下拉菜单或 `FileMenuPopup` 时，`@` 主菜单必须先关闭，不能同时显示两个弹层。
  - 当输入框出现软换行、滚动或窗口尺寸变化时，`@` 锚点与二级菜单位置应保持正确。

### 行为 11：将历史消息格式化为可读且可逆的持久化文本

- 触发条件：consumer 调用 serializeHistoryMessage 持久化 chat 消息。
- 预期结果：history formatter 会把 reasoning 与 MCP marker 转为可读 callout，
  并保持工具调用、sub-agent 状态、附件标签与图片列表的既有输出结构。
- 边界情况：
  - 当消息内容里已经带有 MCP marker 时，不应再从 toolCalls 追加重复的工具历史块。
  - 当 history text 再交给历史解析 helper 时，reasoning 与 MCP callout 应能恢复为 marker 文本。

### 行为 12：构建、归一化并裁剪历史摘要

- 触发条件：consumer 调用历史摘要 helper，为 context compaction 生成、修复或压缩 summary。
- 预期结果：summary build 会保留可见正文、工具/路径/约束等关键信息，并记录被折叠的 reasoning 数量；
  normalize 会在生成结果结构不完整时回退到 fallback，并回补遗漏的重要细节；
  budget helper 会优先裁掉非关键 section item，尽量保留 IMPORTANT DETAILS。
- 边界情况：
  - assistant 消息中的 reasoning block 只计入 droppedReasoningCount，不应混入可见摘要正文。
  - 当生成摘要缺少预期 section heading 时，应直接回退 fallback。
  - 当预算非常小但仍需压缩时，非关键 section 可截断字符，IMPORTANT DETAILS 尽量不做字符裁剪。

### 行为 13：按预算压缩历史消息并维护 context compaction 状态

- 触发条件：consumer 调用 MessageContextOptimizer，或 provider message 组装链路触发历史压缩。
- 预期结果：optimizer 会保留 pinned 消息、最近 user turn 与 sticky tail 的临时上下文，
  在预算不足时生成或复用历史摘要，并把结果写回 contextCompaction 状态。
- 边界情况：
  - 当受保护层本身已经超预算时，应标记 overflowedProtectedLayers，而不是错误生成空摘要。
  - 当已有 compaction 的 coveredRange 与 signature 完全匹配时，应优先复用已有摘要。
  - 当追加历史满足增量条件时，summary generator 应只接收新增 delta summary，而不是整段历史重算。

### 行为 14：通过历史面板控制自动保存状态

- 触发条件：consumer 打开聊天历史面板并切换自动保存开关，或 provider message 组装链路读取
  autosaveChat / shouldSaveHistory 状态。
- 预期结果：自动保存设置通过历史面板标题栏中的 toggle 控制；持久化设置后，
  `shouldSaveHistory` 运行时状态会立即与 `autosaveChat` 同步，后续历史写入链路统一读取该状态。
- 边界情况：
  - 当设置持久化失败时，应回滚到之前的 autosave 状态。
  - 当不同聊天容器（sidebar、tab、modal）打开同一服务时，自动保存状态应保持一致。

### 行为 15：提供 provider message 组装链路的纯辅助逻辑

- 触发条件：legacy provider message facade 读取 messageManagement、默认 file content options、
  compaction/request token 状态比较与 context payload 选择上下文。
- 预期结果：domain helper 只提供纯数据归一化、状态比较和 compaction 编排；
 真正的 App、PromptBuilder 与 frontmatter 持久化仍保留在 legacy。
- 边界情况：
  - 当 raw context message 不存在时，应清空 contextSummary 相关字段，避免保留过期上下文摘要。
  - 当 request token state 内容未变化时，不应触发重复持久化。

## 不做什么（显式排除）

- 该阶段的 chat 域不直接访问 obsidian。
- 该阶段的 chat 域允许通过 `ChatConsumerHost` / `ObsidianApiProvider`
  承接视图激活与 Markdown 渲染接缝，但不直接持有 `Plugin` 或调用裸 `workspace.*`。
- 该阶段的 chat 域不负责 MCP、skills、sub-agent 或 provider 装配。

## 依赖

- Provider：仅依赖 providers.types.ts 中的稳定契约
- 其他域：当前不直接依赖其他域实现

## 变更历史

| 日期 | 变更内容 | 原因 |
| --- | --- | --- |
| 2026-03-28 | 初始版本，迁入共享类型、配置与纯 helper | 执行重构计划阶段三的 chat 域首批实现 |
| 2026-03-28 | 迁入步骤 4 的纯 helper | 缩小 legacy chat service 表面积 |
| 2026-03-28 | 迁入附件选择 helper | 继续缩小 legacy chat service 表面积 |
| 2026-03-28 | 迁入历史格式化与 content helper | 缩小 legacy history helper 表面积 |
| 2026-03-28 | 迁入历史摘要与 budget helper | 缩小 legacy context summary 表面积 |
| 2026-03-28 | 迁入 compaction 与 provider helper | 收口 legacy compaction 主链 |
