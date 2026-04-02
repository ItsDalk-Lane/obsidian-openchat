# 2026-04-01 工具 Surface 发布说明

这几轮更新的目标只有一个：让模型在默认聊天轮次里更稳定地选对工具、少读无关 schema、少走 legacy 入口。

## 你会看到的变化

- Skill 工作流现在默认走两步：先用 `discover_skills` 看可用项，再用 `invoke_skill` 执行具体 Skill。
- Sub-Agent 工作流现在默认走两步：先用 `discover_sub_agents` 看可委托目标，再用 `delegate_sub_agent` 下发任务。
- 时间、网页抓取、目录浏览默认优先走更窄的 wrapper 工具，而不是多模式 legacy 工具。
- 旧名字仍保留兼容执行能力，但不再是默认 surface，也会在工具说明里明确标成兼容入口。

## 默认行为调整

### Skill

- 不知道 Skill 名称时，默认先发现：`discover_skills`
- 已经知道名称，或用户显式输入 `/commit`、`/pdf` 这类 slash command 时，可直接执行：`invoke_skill`
- 旧的 `Skill` 名称只保留兼容语义，不再作为默认工具面的一部分

### Sub-Agent

- 不知道可用代理时，默认先发现：`discover_sub_agents`
- 已经知道代理名称时，再执行委托：`delegate_sub_agent`
- 旧的 `sub_agent_*` 单代理工具名继续兼容，但默认不再直接暴露给模型

### Wrapper

以下 wrapper 现在是默认首选入口：

| 场景 | 默认工具 | 兼容旧名 |
| --- | --- | --- |
| 查询当前时间 | `get_current_time` | `get_time` |
| 时区换算 | `convert_time` | `get_time` |
| 自然语言时间范围 | `calculate_time_range` | `get_time` |
| 单网页抓取 | `fetch_webpage` | `fetch` |
| 多网页批量抓取 | `fetch_webpages_batch` | `fetch` |
| 已知目录单层浏览 | `list_directory_flat` | `list_directory` |
| 已知目录树形浏览 | `list_directory_tree` | `list_directory` |
| 整个 Vault 轻量总览 | `list_vault_overview` | `list_directory` |

## 为什么这样改

- wrapper 的参数更窄，模型更容易一次传对参数
- discover/invoke、discover/delegate 把“先找目标，再执行”的步骤拆开后，schema 面更小，误调用更少
- legacy 工具继续兼容，现有 prompt、脚本和旧对话不会因为这轮改名直接失效

## 兼容性说明

- 现有依赖 `get_time`、`fetch`、`list_directory`、`Skill`、`sub_agent_*` 的旧用法暂时仍可继续执行
- 默认工具选择、设置面板摘要和模型提示会优先引导到 canonical 名称
- 如果你在自定义脚本、提示词或文档里写了旧名字，建议逐步迁移到新的 canonical 名称

## 建议迁移方式

1. Skill 相关文档把“直接调用 `Skill`”改成“先 `discover_skills`，再 `invoke_skill`”。
2. Sub-Agent 文档把“直接写具体 `sub_agent_*`”改成“先 `discover_sub_agents`，再 `delegate_sub_agent`”。
3. 时间、网页、目录类示例统一改成 wrapper 名称，不再把 `get_time`、`fetch`、`list_directory` 当首选入口。

这次更新不要求用户手动切换设置；默认配置已经按新 surface 生效。
