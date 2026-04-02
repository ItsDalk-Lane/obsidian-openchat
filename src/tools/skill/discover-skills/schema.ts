import { z } from 'zod';

export const discoverSkillsToolSchema = z.object({
	query: z
		.string()
		.optional()
		.describe('Optional filter text used to narrow the returned skills list.'),
}).strict();

export const discoverSkillsResultSchema = z.object({
	skills: z.array(z.object({
		name: z.string(),
		description: z.string(),
		path: z.string(),
	}).strict()),
	meta: z.object({
		query: z.string().nullable(),
		returned: z.number().int().nonnegative(),
		total: z.number().int().nonnegative(),
	}).strict(),
}).strict();

export type DiscoverSkillsArgs = z.infer<typeof discoverSkillsToolSchema>;
export type DiscoverSkillsResult = z.infer<typeof discoverSkillsResultSchema>;
