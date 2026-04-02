import { z } from 'zod';
import { readOnlyToolAnnotations } from '../../../vault/filesystemToolSchemas';

export const listCommandsSchema = z.object({
	query: z.string().optional(),
	plugin_id: z.string().optional(),
	max_results: z.number().int().positive().max(200).optional().default(50),
}).strict();

export const listCommandsResultSchema = z.object({
	commands: z.array(z.object({
		id: z.string(),
		name: z.string(),
		plugin: z.string().nullable().optional(),
	}).strict()),
}).strict();

export type ListCommandsArgs = z.infer<typeof listCommandsSchema>;
export type ListCommandsResult = z.infer<typeof listCommandsResultSchema>;

export const listCommandsAnnotations = readOnlyToolAnnotations;
