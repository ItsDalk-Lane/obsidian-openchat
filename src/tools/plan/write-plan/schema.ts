import { z } from 'zod';

export const writePlanTaskSchema = z.object({
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

export const writePlanSchema = z.object({
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

export const writePlanResultSchema = z.object({
	title: z.string(),
	description: z.string().optional(),
	tasks: z.array(
		z.object({
			name: z.string(),
			status: z.enum(['todo', 'in_progress', 'done', 'skipped']),
			acceptance_criteria: z.array(z.string()),
			outcome: z.string().optional(),
		}).strict(),
	),
	summary: z.object({
		total: z.number().int().nonnegative(),
		todo: z.number().int().nonnegative(),
		inProgress: z.number().int().nonnegative(),
		done: z.number().int().nonnegative(),
		skipped: z.number().int().nonnegative(),
	}).strict(),
}).strict();

export const writePlanAnnotations = {
	readOnlyHint: false,
	destructiveHint: false,
	idempotentHint: false,
	openWorldHint: false,
} as const;

export type WritePlanArgs = z.infer<typeof writePlanSchema>;
export type WritePlanResult = z.infer<typeof writePlanResultSchema>;
