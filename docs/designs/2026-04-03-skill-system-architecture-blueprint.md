# 2026-04-03 Skill 系统重构架构蓝图

## 1. 文档目标

本蓝图用于固定本轮 Obsidian Skill 系统重构的目标状态、边界条件与核心不变量。
后续每一轮 Codex 对话都应先阅读本文件，再阅读路线图与执行手册。

本文件解决两个问题：

1. 让多轮 Codex 对话共享同一个“目标架构”。
2. 避免后续实现只盯局部代码修改，逐步偏离原定方向。

## 2. 本轮范围

### 2.1 本轮必须完成

- 仅支持本地 Vault Skill 来源。
- 为未来多来源扩展预留稳定接口，但不实现额外来源。
- 保持现有 `SKILL.md` 向下兼容。
- 设置页保留“名称 + 简短描述”的列表样式。
- 设置页新增 Skill 的删除、编辑、启用/禁用操作。
- 设置页新增通过表单创建 Skill 的能力。
- 统一 slash command 与 `invoke_skill` 的执行路径。
- 引入 Skill 子执行隔离，支持“调用 Skill 后返回主任务继续执行”。

### 2.2 本轮明确不做

- 不接入 MCP / remote / bundled / plugin skill 来源。
- 不引入 shell 级权限执行。
- 不实现完整的远程 Skill 安装市场。
- 不做大规模 UI 改版，不改变设置页主列表的简洁外观。
- 不删除现有兼容入口，除非已经有稳定替代且通过回归验证。

## 3. 核心设计原则

### 3.1 向下兼容优先

- 旧 `SKILL.md` 没有新 frontmatter 字段时必须能继续工作。
- 旧 skill 扫描、旧名称匹配与旧调用入口在迁移期必须保持可用。

### 3.2 本地优先、接口先行

- 功能上只做本地来源。
- 结构上必须先定义 `SkillSource` 抽象，避免后续扩展来源时重构扫描主干。

### 3.3 UI 简洁、细节进模态

- 设置页列表只展示名称和简短描述。
- 复杂字段全部收进编辑模态和创建表单。

### 3.4 Skill 执行必须可恢复主任务

- 主任务与 Skill 子任务不能共享同一份无边界上下文。
- Skill 返回主线程时只能回传结构化结果，不直接回灌完整对话。

### 3.5 渐进迁移

- 优先抽象与桥接，再替换旧调用链。
- 每一轮 Codex 对话只做一个 Step，不跨步实现。

## 4. 目标模块结构

建议最终落点如下：

```text
src/domains/skills/
  config.ts
  types.ts
  source.ts
  registry.ts
  execution.ts
  session-state.ts
  service.ts
  ui.ts

src/components/skills/
  SkillEditorModal.tsx
  CreateSkillForm.tsx
```

### 4.1 `types.ts`

负责承载 Skill manifest、definition、trigger、execution config、session frame 等纯类型。

### 4.2 `source.ts`

负责定义 `SkillSource` 接口与 `LocalVaultSkillSource`。

`LocalVaultSkillSource` 负责：

- 扫描本地 Skill 目录
- 读取 Skill 内容
- 创建 Skill
- 更新 Skill
- 删除 Skill
- 启用/禁用 Skill
- 对接 watcher

### 4.3 `registry.ts`

负责：

- 缓存与快照
- 按 id / name 查询
- 汇总错误
- 对 UI 暴露统一查询接口

### 4.4 `execution.ts`

负责：

- 统一 slash command 与 `invoke_skill`
- 根据 execution mode 走不同执行策略
- 生成 `SkillReturnPacket`

### 4.5 `session-state.ts`

负责：

- 冻结主任务帧
- 创建 Skill 调用帧
- 写入返回包
- 恢复主任务

## 5. 数据模型不变量

### 5.1 Skill 来源

```ts
type SkillSourceKind = 'local'
```

- 当前只允许 `local`。
- 代码层面允许未来新增其他 kind，但本轮不注册。

### 5.2 Skill Manifest

Skill 必须支持下列逻辑字段：

- `name`
- `description`
- `enabled`
- `when_to_use`
- `arguments`
- `execution`
- `allowed_tools`
- `compatibility`
- `metadata`

旧文件缺省时，必须自动补默认值。

### 5.3 编辑详情与列表详情分离

- 列表只读 `name`、`description`、`enabled`、`lastError` 的摘要。
- 模态读取完整 `SkillEditorDetail`。

### 5.4 权限边界

- `allowed_tools` 只表示插件内工具白名单。
- 不表示操作系统级别权限。
- 不允许在本轮设计里把 Skill 扩展成任意 shell 执行器。

## 6. 设置页不变量

设置页列表必须满足：

- 保持当前卡片式列表结构。
- 每行仅显示 Skill 名称和简短描述。
- 每行右侧新增：
  - 编辑
  - 删除
  - 启用/禁用

编辑模态必须提供：

- 来源
- 路径
- 触发条件
- 参数
- 执行模式
- 允许工具
- 错误
- 禁用状态
- 测试运行入口

设置页还必须提供一个创建 Skill 的表单，提交后自动创建：

- Skill 文件夹
- `SKILL.md`
- frontmatter
- 正文模板

## 7. 执行模型不变量

### 7.1 执行模式

```ts
type SkillExecutionMode = 'inline' | 'isolated' | 'isolated_resume'
```

默认模式必须是：

```ts
'isolated_resume'
```

### 7.2 主任务恢复机制

必须显式引入：

- `MainTaskFrame`
- `SkillInvocationFrame`
- `SkillReturnPacket`

执行顺序固定为：

1. 冻结主任务
2. 生成 Skill 调用帧
3. Skill 在独立上下文执行
4. 仅返回结构化结果包
5. 恢复主任务并继续

### 7.3 上下文隔离规则

- Skill 只接收主任务切片，不接收完整主会话历史。
- 主线程只接收 `SkillReturnPacket`，不接收完整 Skill 对话。
- 任何实现如果把 Skill 正文再次直接塞回主消息历史，都视为偏离目标架构。

## 8. 向下兼容要求

### 8.1 `SKILL.md`

- 缺少新字段时自动补默认值。
- 旧 `name` / `description` 解析逻辑保持兼容。

### 8.2 扫描与监听

- 旧 `SkillScannerService` 在迁移期可以作为桥接层保留。
- 迁移后应逐步退化为 facade，而不是突然删除。

### 8.3 调用入口

- slash command 与 `invoke_skill` 在迁移期都保持可用。
- 最终它们必须落到同一执行器，而不是保留两套业务逻辑。

## 9. 完成标准

满足以下条件，才算本轮重构完成：

1. 本地 Skill 的扫描、编辑、删除、启停、创建都可用。
2. 设置页支持完整 Skill 管理，但主列表仍简洁。
3. slash command 与 `invoke_skill` 共享一条执行主链。
4. 默认执行模式为 `isolated_resume`。
5. 调用 Skill 后可返回主任务继续执行。
6. 旧 `SKILL.md` 与旧调用入口保持兼容。
7. 有最小可重复的测试与手工验证清单。

## 10. 后续阅读顺序

每次开始新一轮 Codex 对话时，建议按以下顺序阅读：

1. `docs/designs/2026-04-03-skill-system-architecture-blueprint.md`
2. `docs/designs/2026-04-03-skill-system-codex-roadmap.md`
3. `docs/designs/2026-04-03-skill-system-codex-playbook.md`
4. `task_plan.md`
5. `findings.md`
6. `progress.md`
