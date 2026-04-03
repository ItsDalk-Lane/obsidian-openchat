# 2026-04-03 Skill 系统重构 Codex 分步实施路线图

## 1. 使用方式

本路线图只服务于本轮 Skill 系统重构。
每次开启一个新的 Codex 对话，只允许执行一个 Step。

每轮对话开始时，建议直接要求 Codex：

“请按照 `docs/designs/2026-04-03-skill-system-codex-roadmap.md`
的 Step XX 执行，只完成这一步，并在结束前更新
`task_plan.md`、`findings.md`、`progress.md`。”

## 2. 总执行规则

### 2.1 一次对话只做一个 Step

- 不允许跨两个 Step 实现。
- 如果发现当前 Step 过大，先在本轮里把它再拆分并回写文档。
- 当前 Step 未验收，不进入下一步。

### 2.2 收尾动作固定

每次对话结束前必须完成：

- 本 Step 的代码或文档改动
- 本 Step 的最小验证
- 更新 `task_plan.md`
- 更新 `findings.md`
- 更新 `progress.md`
- 明确写出“下一步应执行哪个 Step”

### 2.3 不混做 UI 与执行链大改

- Step 01 到 Step 05 优先打基础设施与 CRUD 主干。
- Step 06 到 Step 08 只做设置页与管理 UI。
- Step 09 到 Step 13 只做执行链与上下文隔离。
- Step 14 才做最终回归、文档和收口。

### 2.4 向下兼容优先

- 旧 `SKILL.md`、旧扫描入口、旧调用方式在迁移期间必须继续可用。
- 新结构先做桥接，再逐步收敛旧逻辑。

## 3. Step 总览

| Step | 类型 | 目标 |
| --- | --- | --- |
| 01 | 基础类型 | 扩展 Skill 类型与 frontmatter 兼容解析 |
| 02 | 来源抽象 | 引入 `SkillSource` 与 `LocalVaultSkillSource` |
| 03 | 注册表 | 引入 `SkillRegistry` 与统一快照查询 |
| 04 | 本地管理 | 落地 Skill 创建、更新、删除、启停 |
| 05 | 服务桥接 | 让现有 `service.ts` / `ui.ts` 接入新 source + registry |
| 06 | 设置页动作 | 为列表增加编辑、删除、启用/禁用操作 |
| 07 | 编辑模态 | 落地 Skill 详情编辑模态与测试运行入口 |
| 08 | 创建表单 | 落地设置页创建 Skill 表单 |
| 09 | 会话状态 | 引入 `SkillSessionState`、主任务帧与返回包 |
| 10 | 执行器 | 落地 `SkillExecutionService` |
| 11 | slash command | `/skill` 路径接入统一执行器 |
| 12 | invoke_skill | 工具调用路径接入统一执行器 |
| 13 | 解析与注入 | relevant skill resolver 与系统提示注入收敛 |
| 14 | 收口验证 | 测试、文档、手工验证清单与遗留兼容检查 |

## 4. 详细步骤

### Step 01：扩展 Skill 类型与 frontmatter 兼容解析

- 目标：在不破坏旧 Skill 的前提下，引入新 manifest 结构与默认值。
- 重点文件：
  - `src/domains/skills/types.ts`
  - `src/domains/skills/service.ts`
  - `src/domains/skills/config.ts`
- 必做事项：
  - 增加 `enabled`、`when_to_use`、`arguments`、`execution`、`allowed_tools` 类型。
  - 扩展 frontmatter 解析与默认值回填。
  - 保持旧 `name` / `description` 兼容。
- 验收标准：
  - 旧 `SKILL.md` 无需修改也能扫描成功。
  - 新字段缺省时不会报错。
  - `SkillDefinition` 能表达新结构。
- 建议验证：
  - parser 单测
  - 最小 `tsc` 或等效定向类型检查

### Step 02：引入 `SkillSource` 与 `LocalVaultSkillSource`

- 目标：把“来源接口”与“本地 Vault 实现”正式分开。
- 重点文件：
  - `src/domains/skills/source.ts`
  - `src/domains/skills/service.ts`
- 必做事项：
  - 定义 `SkillSource` 接口。
  - 新增 `LocalVaultSkillSource`。
  - 让扫描与读取逻辑迁入 source 层。
- 验收标准：
  - 现在只注册一个本地来源。
  - 结构上已经支持未来增加来源。
  - 旧扫描调用仍可经桥接工作。
- 建议验证：
  - source 层单测
  - watcher 相关最小回归

### Step 03：引入 `SkillRegistry` 与统一快照查询

- 目标：把缓存、索引、错误聚合从 source 中剥出来。
- 重点文件：
  - `src/domains/skills/registry.ts`
  - `src/domains/skills/service.ts`
  - `src/domains/skills/ui.ts`
- 必做事项：
  - 增加 registry 快照接口。
  - 支持 `findById`、`findByName`、`getSnapshot`、`refresh`。
  - 保持现有变更通知链可继续工作。
- 验收标准：
  - UI 不直接依赖 source。
  - cache / index / error 聚合逻辑都进 registry。
- 建议验证：
  - registry 查询测试
  - settings snapshot 回归

### Step 04：落地 Skill 创建、更新、删除、启停

- 目标：让本地 Skill 管理能力先可用，再做 UI。
- 重点文件：
  - `src/domains/skills/source.ts`
  - `src/domains/skills/service.ts`
- 必做事项：
  - 增加 create / update / remove / setEnabled。
  - 自动生成文件夹、`SKILL.md`、默认 frontmatter、正文模板。
  - 删除操作删除整个 Skill 目录。
- 验收标准：
  - 不需要手工建文件夹就能新增 Skill。
  - 启用/禁用能稳定写回 frontmatter。
  - 删除后 registry 快照同步更新。
- 建议验证：
  - CRUD 单测
  - 临时目录集成测试

### Step 05：让现有 `service.ts` / `ui.ts` 接入新主干

- 目标：保留旧外观与旧事件链，但内部切到 source + registry。
- 重点文件：
  - `src/domains/skills/service.ts`
  - `src/domains/skills/ui.ts`
  - 组合根与相关注入位置
- 必做事项：
  - 让旧 `SkillScannerService` 退化为 facade 或桥接层。
  - 统一变更监听。
  - 保证旧调用方无需一次性全部重写。
- 验收标准：
  - 外部调用签名尽量少变。
  - 内部真实数据来源已经改为新主干。
- 建议验证：
  - 现有 skill 列表加载回归
  - 监听回调回归

### Step 06：设置页列表增加操作组件

- 目标：在不改动主列表结构的前提下，加上管理动作。
- 重点文件：
  - `src/components/chat-components/chatSettingsIntegrationTabs.tsx`
  - `src/components/chat-components/ChatSettingsContext.tsx`
- 必做事项：
  - 每行增加编辑、删除、启用/禁用。
  - 接入确认与错误提示。
  - 保持名称 + 简短描述布局不变。
- 验收标准：
  - 列表依旧简洁。
  - 三个操作都可触发对应回调。
- 建议验证：
  - React 组件测试
  - 最小手工交互验证

### Step 07：落地 Skill 编辑模态

- 目标：把复杂字段收进独立模态，不污染主列表。
- 重点文件：
  - `src/components/skills/SkillEditorModal.tsx`
  - `src/components/chat-components/ChatSettingsContext.tsx`
- 必做事项：
  - 展示来源、路径、触发条件、参数、执行模式、允许工具、错误、禁用状态。
  - 支持保存编辑结果。
  - 增加测试运行入口。
- 验收标准：
  - 模态能完整读取并修改 Skill。
  - 来源与路径只读显示。
  - 错误信息可见。
- 建议验证：
  - 模态交互测试
  - 表单提交回归

### Step 08：落地创建 Skill 表单

- 目标：让用户在设置页直接创建 Skill。
- 重点文件：
  - `src/components/skills/CreateSkillForm.tsx`
  - `src/components/chat-components/ChatSettingsContext.tsx`
- 必做事项：
  - 表单收集名称、描述、触发条件、参数、执行模式、允许工具、正文模板。
  - 提交后调用 Step 04 的 create。
  - 创建成功后刷新列表。
- 验收标准：
  - 无需手工建目录即可新增 Skill。
  - 新 Skill 创建后立即出现在列表中。
- 建议验证：
  - 创建表单测试
  - 临时 vault 集成验证

### Step 09：引入 `SkillSessionState` 与主任务帧

- 目标：为“先调 Skill，再回主任务”打状态基础。
- 重点文件：
  - `src/domains/skills/session-state.ts`
  - chat session 相关类型与服务
- 必做事项：
  - 定义 `MainTaskFrame`、`SkillInvocationFrame`、`SkillReturnPacket`。
  - 增加冻结主任务、写入返回包、恢复主任务能力。
- 验收标准：
  - 运行期可明确区分主任务状态与 skill 子执行状态。
  - 结构上不再要求 skill 直接污染主会话。
- 建议验证：
  - session-state 单测

### Step 10：落地 `SkillExecutionService`

- 目标：统一 Skill 执行主链。
- 重点文件：
  - `src/domains/skills/execution.ts`
  - 相关注入与服务组合根
- 必做事项：
  - 实现 `inline`、`isolated`、`isolated_resume`。
  - 默认 `isolated_resume`。
  - 只回传 `SkillReturnPacket` 给主线程。
- 验收标准：
  - 执行器可单独被 slash command 和 tool 调用。
  - 主任务与 Skill 子任务的上下文边界清晰。
- 建议验证：
  - execution 单测
  - 一个复合任务的集成测试

### Step 11：slash command 接入统一执行器

- 目标：替换当前直接把 Skill 注入模板的方式。
- 重点文件：
  - `src/core/chat/services/chat-commands.ts`
  - `src/core/chat/services/chat-message-operations.ts`
  - `src/domains/skills/execution.ts`
- 必做事项：
  - `/skill` 调用改走 `SkillExecutionService`。
  - 保持用户入口不变。
  - 保证调用后可回到主任务。
- 验收标准：
  - slash command 行为保持兼容。
  - 不再直接把 Skill 正文作为唯一主执行载荷塞入当前消息流。
- 建议验证：
  - chat command 定向测试

### Step 12：`invoke_skill` 工具接入统一执行器

- 目标：让工具调用和 slash command 真正共用执行主干。
- 重点文件：
  - `src/tools/skill/invoke-skill/tool.ts`
  - `src/tools/skill/_shared/service.ts`
  - `src/domains/skills/execution.ts`
- 必做事项：
  - `invoke_skill` 改为调用统一执行器。
  - 保持旧工具名与兼容别名不变。
  - 让工具输出能够表达结构化返回包。
- 验收标准：
  - `invoke_skill` 与 slash command 不再各自维护业务逻辑。
  - legacy alias 继续可用。
- 建议验证：
  - tool 定向测试
  - legacy alias 回归

### Step 13：relevant skill resolver 与提示注入收敛

- 目标：让模型看到“当前最相关的 Skill”，而不是泛泛说明。
- 重点文件：
  - `src/domains/skills/registry.ts`
  - `src/domains/skills/service.ts`
  - chat prompt 注入相关服务
- 必做事项：
  - 新增上下文相关性排序。
  - 只向模型注入前 N 个相关 Skill 摘要。
  - 避免全量 Skill 列表污染主上下文。
- 验收标准：
  - prompt 注入从固定说明升级为相关 Skill 摘要。
  - 不会把全部 Skill 正文塞进系统提示词。
- 建议验证：
  - resolver 单测
  - prompt 拼装回归

### Step 14：测试、文档、手工验证与收口

- 目标：为本轮重构收尾并沉淀可复用验证口径。
- 重点文件：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
  - `docs/designs/2026-04-03-skill-system-*.md`
- 必做事项：
  - 补齐本轮测试缺口。
  - 输出手工验证清单。
  - 检查旧兼容桥接是否都有文档说明。
- 验收标准：
  - 代码、文档、验证记录一致。
  - 下一次进入真实增强功能时有稳定基线。
- 本步建议输出物：
  - 一组覆盖 slash command、`invoke_skill`、relevant prompt 注入的收口回归
  - 一份真实 Obsidian 手工 smoke checklist
  - 一份兼容桥接文档索引，明确旧 `Skill`、`discover_skills` / `invoke_skill`
    与 `/skill` 的说明分别落在哪些文档
- 建议验证：
  - `npm run test`
  - 必要的 lint / build
  - 真实 Obsidian 手工 smoke test 清单
