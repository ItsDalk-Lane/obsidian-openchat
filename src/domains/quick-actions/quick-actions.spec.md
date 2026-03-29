# quick-actions 域规格

## 概述

quick-actions 域负责快捷操作的 Markdown 持久化、嵌套分组约束与
AI 执行逻辑。它通过窄端口组合访问 Vault、系统提示词与 provider 请求能力，
并为 editor/settings 壳层提供最小 service 接缝。

## 核心行为

### 行为 1：从 Markdown 目录加载并规范化快捷操作

- 触发条件：settings 面板或 editor 侧首次读取快捷操作。
- 预期结果：从 `quick-actions/*.md` 读取 frontmatter + body，
  规范化为稳定的 `QuickAction[]`，并同步运行时缓存。
- 边界情况：
  - 当 Markdown 文件损坏或 frontmatter 解析失败时 → 跳过单文件并记录日志。
  - 当 AI 数据目录未配置时 → 读取路径回退为空列表；保存路径返回结构化错误。

### 行为 2：维护分组结构与排序

- 触发条件：拖拽移动、编辑操作组成员、删除或重排快捷操作。
- 预期结果：更新 group children、顶层顺序与 Markdown 存储。
- 边界情况：
  - 目标不是合法 group / 自身 / 后代 / 循环引用 / 超过 3 层嵌套时
    → Service 核心流程返回 typed Result。
  - settings 面板主路径直接消费 Result-first 入口；
    兼容 public API 仅保留给旧调用方。

### 行为 3：执行快捷操作请求

- 触发条件：用户在 editor 或 chat 壳层执行某个快捷操作。
- 预期结果：解析模板、拼装系统提示词与用户消息，然后通过 provider 发送请求。
- 边界情况：
  - 操作组不可执行、缺少模型配置、provider 不存在、模板读取失败等
    → 通过 `QuickActionExecutionError` 显式建模。
  - `executeQuickAction()` 保持现有结构化失败返回；
    `executeQuickActionStreamResult()` 提供 Result-first 流式入口；
    `executeQuickActionStream()` 仅作为兼容包装保留旧抛错语义。

## 分层

- `service-data.ts`
  - 负责 `quick-actions/*.md` 的读取、写入、删除与运行时同步
- `service-execution.ts`
  - 负责模板解析、系统提示词拼装与 provider 请求组装
- `service-result.ts`
  - 负责 `QuickActionResult` 与兼容异常包装
- `service-data-utils.ts`
  - 负责 frontmatter 解析、标准化与 Markdown 记录组装
- `service-group-helpers.ts`
  - 负责嵌套层级、拓扑校验与顶层排序

## 不做什么（显式排除）

- 不直接导入 `obsidian`
- 不直接持有 `Plugin` 或 `ObsidianApiProvider` 全量接口
- 不在 editor/settings 壳层里重复实现分组校验与 provider 错误语义

## 依赖

- `src/types/chat.ts`：纯 shim 共享 `QuickAction` / `QuickActionType`
- 宿主能力只能通过 `src/providers/providers.types.ts` 中的窄端口组合
- `QuickActionDataHostPort`：VaultPathPort & VaultReadPort & VaultWritePort & YamlPort
- `QuickActionExecutionHostPort`：VaultReadPort & SystemPromptPort
- `QuickActionProviderAdapter`：封装 vendor 查找、options 归一化与 sendRequest 创建
- `src/editor/selectionToolbar/*` 中迁出的旧路径只保留 re-export shim

## 用户可见文案

| 场景 | 中文 | English |
| --- | --- | --- |
| 非法操作组目标 | 目标不是有效的操作组 | Target is not a valid action group |
| 超出嵌套层数 | 最多支持 3 层嵌套 | A maximum of 3 nesting levels is supported |
| 缺少模型配置 | 未找到可用的 AI 模型配置 | No available AI model configuration found |
| Provider 不存在 | 未找到 AI 提供商：{vendor} | AI provider not found: {vendor} |

## 变更历史

| 日期 | 变更内容 | 原因 |
| --- | --- | --- |
| 2026-03-29 | settings/editor 主路径改为直接消费 Result-first 入口；新增 `executeQuickActionStreamResult()` | 关闭 P2 残余：让 consumer 语义也与 Result 哲学对齐 |
| 2026-03-29 | 引入 `QuickActionResult`、错误 union 与兼容异常包装；spec 明确记录 typed Result 语义 | 关闭 P2：让可预期错误不再主要依赖 generic Error |
| 2026-03-29 | 初始 quick-actions 域规格 | 记录域职责与 shim 边界 |
