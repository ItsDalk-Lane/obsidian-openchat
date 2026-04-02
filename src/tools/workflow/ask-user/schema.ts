import { z } from 'zod';

export const askUserOptionSchema = z.object({
	label: z.string().min(1).max(120),
	value: z.string().min(1).max(200),
	description: z.string().max(200).optional(),
}).strict();

export const askUserSchema = z.object({
	question: z.string().min(1).max(1_000).describe('向用户展示的澄清问题。'),
	options: z.array(askUserOptionSchema)
		.max(8)
		.optional()
		.describe('可选的候选答案列表。'),
	allow_free_text: z.boolean().optional().describe('是否允许用户输入自由文本答案。'),
}).strict();

export const askUserResultSchema = z.object({
	answered: z.boolean(),
	selected_value: z.string().optional(),
	free_text: z.string().optional(),
}).strict();

export type AskUserArgs = z.infer<typeof askUserSchema>;
export type AskUserOption = z.infer<typeof askUserOptionSchema>;
export type AskUserResult = z.infer<typeof askUserResultSchema>;

export const askUserAnnotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: false,
	openWorldHint: false,
} as const;
