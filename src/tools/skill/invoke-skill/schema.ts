import { z } from 'zod';

export const invokeSkillToolSchema = z.object({
	skill: z
		.string()
		.min(1)
		.describe('The skill name. E.g. "commit", "review-pr", or "pdf".'),
	args: z
		.string()
		.optional()
		.describe('Optional arguments or context for the skill.'),
}).strict();

export type InvokeSkillArgs = z.infer<typeof invokeSkillToolSchema>;
