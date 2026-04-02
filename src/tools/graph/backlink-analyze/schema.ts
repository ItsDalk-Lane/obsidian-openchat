import { z } from 'zod';
import { readOnlyToolAnnotations } from '../../vault/filesystemToolSchemas';

export const backlinkAnalyzeSchema = z.object({
	file_path: z.string().min(1).describe('目标 Markdown 笔记路径。'),
	include_outgoing: z.boolean().optional().default(true),
	include_unresolved: z.boolean().optional().default(false),
	depth: z.union([z.literal(1), z.literal(2)]).optional().default(1),
}).strict();

export const backlinkPathCountSchema = z.object({
	path: z.string(),
	count: z.number().int().nonnegative(),
}).strict();

export const backlinkAnalyzeResultSchema = z.object({
	file_path: z.string(),
	incoming: z.array(backlinkPathCountSchema),
	outgoing: z.array(backlinkPathCountSchema).optional(),
	mutual: z.array(z.object({ path: z.string() }).strict()),
	unresolved: z.array(z.string()).optional(),
}).strict();

export type BacklinkAnalyzeArgs = z.infer<typeof backlinkAnalyzeSchema>;
export type BacklinkAnalyzeResult = z.infer<typeof backlinkAnalyzeResultSchema>;

export const backlinkAnalyzeAnnotations = readOnlyToolAnnotations;
