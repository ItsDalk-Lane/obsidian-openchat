import { z } from 'zod';
import { PlanState } from '../runtime/plan-state';
import type { BuiltinTool } from '../runtime/types';

const writePlanTaskSchema = z.object({
	name: z
		.string()
		.min(1)
		.describe('任务名称，建议使用祈使句，清楚表达要执行的动作。'),
	status: z
		.enum(['todo', 'in_progress', 'done', 'skipped'])
		.describe('任务状态，只能是 todo、in_progress、done 或 skipped。'),
	acceptance_criteria: z
		.array(z.string())
		.optional()
		.describe('任务的验收标准列表，用于判断该任务是否真正完成。'),
	outcome: z
		.string()
		.optional()
		.describe('任务执行结果的简要说明，通常在 done 或 skipped 时填写。'),
}).strict();

const writePlanSchema = z.object({
	title: z
		.string()
		.optional()
		.describe('计划标题，用一句话概括本次任务的总体目标。'),
	description: z
		.string()
		.optional()
		.describe('计划背景或补充说明，用于解释上下文、范围或目标。'),
	tasks: z
		.array(writePlanTaskSchema)
		.min(1)
		.describe('任务列表，至少包含一个任务，顺序应反映执行节奏。'),
}).strict();

const writePlanResultSchema = z.object({
	title: z.string(),
	description: z.string().optional(),
	tasks: z.array(
		z.object({
			name: z.string(),
			status: z.enum(['todo', 'in_progress', 'done', 'skipped']),
			acceptance_criteria: z.array(z.string()),
			outcome: z.string().optional(),
		})
	),
	summary: z.object({
		total: z.number().int().nonnegative(),
		todo: z.number().int().nonnegative(),
		inProgress: z.number().int().nonnegative(),
		done: z.number().int().nonnegative(),
		skipped: z.number().int().nonnegative(),
	}),
});

const WRITE_PLAN_DESCRIPTION = `创建或更新当前会话的 live plan，用于持续记录任务拆解、进度和结果。

## 何时使用

- 需要为复杂任务建立执行计划时
- 需要同步任务进度、验收标准或执行结果时
- 需要把当前工作拆分成可跟踪的多个步骤时

## 何时不使用

- **不要用于直接操作文件或目录**：文件系统改动请使用对应文件工具
- **不要用于执行脚本或命令**：需要运行逻辑时请使用 \`run_script\` 或 \`run_shell\`
- **不要把它当作通用笔记存储**：这里只记录当前任务的结构化计划

## 可用字段

- **title**（可选）：计划标题，用一句话概括整体目标
- **description**（可选）：计划背景、范围或补充说明
- **tasks**（必需）：任务数组，至少包含一个任务
- **tasks[].name**（必需）：任务名称，建议使用祈使句
- **tasks[].status**（必需）：任务状态，取值为 \`todo\`、\`in_progress\`、\`done\`、\`skipped\`
- **tasks[].acceptance_criteria**（可选）：验收标准列表
- **tasks[].outcome**（可选）：任务执行结果摘要

## 状态流转

- 常规流转为 \`todo\` -> \`in_progress\` -> \`done\`
- 无法继续或无需执行的任务可标记为 \`skipped\`
- 同一任务应只保留一个当前状态，避免重复创建等价任务

## 返回值

返回更新后的完整计划状态，包括 \`title\`、\`description\`、\`tasks\` 和 \`summary\`。其中 \`summary\` 会汇总各状态的任务数量。

## 失败恢复

- 如果状态值无效，改用允许的枚举值重新调用
- 如果 \`tasks\` 为空，至少传入一个任务
- 如果只是需要执行某个动作，不要继续重试 \`write_plan\`，应改用对应工具

## 示例

\`\`\`json
{
  "title": "优化 MCP 工具定义",
  "description": "先修复 schema 严格性，再统一描述格式",
  "tasks": [
    {
      "name": "补全 strict schema",
      "status": "in_progress",
      "acceptance_criteria": ["所有 z.object 都显式 strict"]
    },
    {
      "name": "更新测试断言",
      "status": "todo"
    }
  ]
}
\`\`\``;

export function createPlanTools(planState: PlanState): BuiltinTool[] {
	return [{
		name: 'write_plan',
			title: '更新 Live Plan',
			description: WRITE_PLAN_DESCRIPTION,
			inputSchema: writePlanSchema,
			outputSchema: writePlanResultSchema,
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		execute({ title, description, tasks }) {
			return planState.update({
				title,
				description,
				tasks,
			});
		},
	}];
}
