# skills 行为规格

## 概述

skills 域负责扫描用户技能目录、监听技能文件变化、向 chat 与工具运行时提供可查询的技能清单与技能内容。

## 核心行为

### 行为 1：扫描已安装技能

- 触发条件：插件初始化、手动刷新技能、首次读取技能清单。
- 预期结果：读取 AI 数据目录下的 skills 子目录，解析每个技能目录中的 SKILL.md frontmatter，并返回稳定排序的技能列表与错误列表。
- 边界情况：
  - 当旧版 SKILL.md 只包含 `name` 与 `description` 时 → 仍可扫描成功，并为 Step 01 新增字段回填默认值。
  - 当 `enabled: false` 时 → 扫描结果与设置页列表仍保留该 Skill，但运行时查询默认不应把它当作可执行 Skill。
  - 当目录不存在或为空时 → 返回空列表，不报错。
  - 当 frontmatter 非法时 → 报错记录进入 errors，但不阻断其他技能加载。
  - 当 Step 01 新增字段已声明但类型非法时 → 当前 Skill 进入 errors，但不阻断其他技能加载。
  - 当技能名称重复时 → 后者覆盖前者，并记录 warning。

### 行为 2：监听技能文件变化

- 触发条件：skills 目录下的 SKILL.md 被创建、修改、删除或重命名。
- 预期结果：在防抖窗口后重新扫描，并把新的技能列表推送给订阅者。
- 边界情况：
  - 非 SKILL.md 文件变化时 → 不触发刷新。
  - 短时间内多次变化时 → 合并为一次刷新。

### 行为 3：加载技能正文与 system prompt 片段

- 触发条件：工具运行时读取某个技能正文，或 chat 构建技能提示词块。
- 预期结果：返回剥离 frontmatter 的技能正文，并生成安全转义后的技能 XML 片段。
- 边界情况：
  - 当技能未注册或文件不存在时 → 返回清晰错误。
  - 当 Skill 已禁用时 → relevant resolver、discover_skills、
    slash command 与 `invoke_skill` 默认忽略或拒绝执行，
    不再向模型注入该 Skill。
  - 当技能名或描述包含 XML 特殊字符时 → 必须转义。

## 不做什么（显式排除）

- 该域不负责 settings 持久化，AI 数据根目录由外层注入。
- 该域不直接导入 obsidian，Vault 访问与 YAML 解析都通过 Provider 注入。
- 该域不负责 chat UI 展示，仅提供技能运行时数据。

### 行为 4：管理本地 Skill 文档

- 触发条件：设置页或服务层发起创建、更新、删除、启用/禁用命令。
- 预期结果：在 AI 数据目录下创建或更新对应的 Skill 目录与 `SKILL.md`，并在删除时移除整个 Skill 目录。
- 边界情况：
  - 创建新 Skill 时 → 自动创建目录、写入默认 frontmatter 与正文模板，不要求用户手工建目录。
  - 更新旧版 `SKILL.md` 时 → 只写回本次显式修改的字段，不把运行时默认值误写入旧 frontmatter。
  - 启用/禁用时 → 只稳定写回 `enabled` 字段，不污染正文内容。
  - 当 `execution.mode === inline` 且声明了 `allowed_tools` 时 →
    创建、编辑与执行都必须稳定拒绝该组合；`allowed_tools`
    只对 `isolated` / `isolated_resume` 生效。
  - 删除时 → 删除整个 Skill 目录，避免遗留附件与其他辅助文件。
  - 写操作完成后 → 当前 service 实例内的 snapshot 需要立即 refresh，保证后续查询结果一致。
  - 写操作或首次扫描完成后 → 旧 runtime 监听链也要收到同一份结果，避免设置页与调用方各自手动补 refresh。

## 依赖

- 依赖的 Provider：ObsidianApiProvider
- 依赖的其他域：无

## 用户可见文案

| 场景 | 中文 | English |
| --- | --- | --- |
| 技能工具未找到技能 | 未找到对应 Skill | Skill not found |
| 技能工具调用失败 | Skill 工具调用失败：{reason} | Skill tool failed: {reason} |

## 变更历史

| 日期 | 变更内容 | 原因 |
| --- | --- | --- |
| 2026-04-03 | 增加 Step 05 写后广播与旧 runtime 监听桥接约束 | Skill 系统重构 Step 05 |
| 2026-04-03 | 增加 Step 04 本地 Skill 创建、更新、删除与启停行为约束 | Skill 系统重构 Step 04 |
| 2026-04-03 | 增加 Step 01 manifest 默认值回填与新增字段非法时的兼容约束 | Skill 系统重构 Step 01 |
| 2026-03-28 | 初始版本，迁移 skills 域 | 执行重构计划第二个域迁移 |
