# 2026-04-03 Skill 系统重构 Codex 执行手册

## 1. 这份手册解决什么问题

本手册用于控制多轮 Codex 对话的方向一致性。
目标不是解释架构，而是约束每一轮对话如何开始、如何执行、如何收尾。

## 2. 每轮对话开工前必须阅读的文件

按下面顺序读取：

1. `docs/designs/2026-04-03-skill-system-architecture-blueprint.md`
2. `docs/designs/2026-04-03-skill-system-codex-roadmap.md`
3. `docs/designs/2026-04-03-skill-system-codex-playbook.md`
4. `task_plan.md`
5. `findings.md`
6. `progress.md`

如果当前 Step 涉及具体模块，再额外读取该 Step 指定的重点代码文件。

## 3. 每轮对话的硬约束

### 3.1 只能完成一个 Step

- 不要在同一轮同时实现两个 Step。
- 如果发现当前 Step 太大，先停下来把当前 Step 继续拆分，并更新路线图。

### 3.2 不允许先做“顺手优化”

- 任何不属于当前 Step 的重构、命名清理、额外抽象都不要做。
- 即使看起来合理，也不要顺手改掉其他模块。

### 3.3 必须保持向下兼容

- 不破坏旧 `SKILL.md`。
- 不破坏旧调用入口。
- 不破坏当前设置页基础布局。

### 3.4 每轮必须回写 planning files

结束前必须更新：

- `task_plan.md`
- `findings.md`
- `progress.md`

## 4. 建议直接复制的开场提示词

## 4.1 标准实现提示词

```text
请先阅读以下文件：
1. docs/designs/2026-04-03-skill-system-architecture-blueprint.md
2. docs/designs/2026-04-03-skill-system-codex-roadmap.md
3. docs/designs/2026-04-03-skill-system-codex-playbook.md
4. task_plan.md
5. findings.md
6. progress.md

然后只执行 Step XX。

要求：
- 只完成这一步，不跨到下一步
- 保持向下兼容
- 优先扩展现有代码，不随意新建平行体系
- 结束前完成最小验证
- 结束前更新 task_plan.md、findings.md、progress.md
- 最后明确写出下一步应该执行哪个 Step
```

## 4.2 失败补救提示词

```text
请先阅读 skill 重构的 blueprint、roadmap、playbook 以及 planning files。
不要继续推进新的 Step，只处理当前 Step XX 的遗留问题或回归问题。

要求：
- 只修复当前 Step 引入的问题
- 不扩散范围
- 结束前补充验证结果
- 更新 task_plan.md、findings.md、progress.md
```

## 4.3 续接提示词

```text
请先阅读 skill 重构相关 blueprint、roadmap、playbook，以及 task_plan.md、findings.md、progress.md。
根据 progress.md 中“下一步应执行”的记录，继续执行对应 Step。
如果发现当前 Step 未真正完成，先补当前 Step，不要进入下一步。
```

## 5. 每轮对话的工作流程

### 5.1 开始阶段

- 读取 blueprint / roadmap / playbook。
- 读取 planning files。
- 只读取当前 Step 需要的代码文件。
- 用一句话确认当前 Step 的目标。

### 5.2 实施阶段

- 只修改当前 Step 直接相关的文件。
- 如果需要新增文件，优先放在 blueprint 约定的目录里。
- 如果发现旧接口很多地方在用，先加桥接层，再改内部实现。

### 5.3 验证阶段

- 至少完成当前 Step 的最小验证。
- 不要用“理论上可行”替代实际验证。
- 如果仓库存在已知无关基线问题，要明确说明本步的有效验证口径。

### 5.4 收尾阶段

必须回写三类内容：

- `task_plan.md`：更新当前 Step 状态与下一步
- `findings.md`：记录本轮设计发现、坑点与兼容约束
- `progress.md`：记录本轮改动文件与验证结果

## 6. 每轮收尾时必须回答的五个问题

1. 当前完成的是哪个 Step？
2. 哪些文件被修改或新增？
3. 做了哪些最小验证？
4. 还有什么风险或未决点？
5. 下一步应执行哪个 Step？

如果缺少其中任一项，这一轮对话就不算真正收尾。

## 7. 遇到阻塞时的处理规则

### 7.1 当前 Step 范围过大

- 不要硬做完。
- 先把当前 Step 拆成更小的子步骤。
- 更新路线图和 planning files。

### 7.2 遇到不确定架构选择

- 先回到 blueprint 中的“不变量”判断。
- 如果会影响兼容性、执行模型或设置页结构，不能私自偏移。

### 7.3 遇到与用户现有改动冲突

- 不回退用户改动。
- 先读取最新文件内容，再决定桥接策略。
- 必要时只记录阻塞，不擅自覆盖。

## 8. Step 完成后的日志模板

建议每次在 `progress.md` 中按这个格式记录：

```text
- 已执行路线图 Step XX：
  - 修改/新增文件：
  - 完成内容：
  - 验证结果：
  - 剩余风险：
  - 下一步应执行：
```

建议每次在 `findings.md` 中补这两类内容：

- 本 Step 暴露出的真实兼容约束
- 本 Step 的实现边界与下一步注意事项

## 9. 判断是否偏离方向的快速检查

如果出现下面任一情况，通常说明已经偏离：

- 当前对话同时改了 UI、执行器、session-state 三块
- 为了方便实现，直接绕过旧兼容层
- 把本轮“只做本地来源”扩展成多来源实现
- 把 Skill 权限设计成 shell 或系统级权限
- 继续把 Skill 正文直接塞回主消息流

一旦出现，应该停下来，回到当前 Step 的边界重新收敛。
