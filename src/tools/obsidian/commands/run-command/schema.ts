import { z } from 'zod';
import { mutationToolAnnotations } from '../../../vault/filesystemToolSchemas';

export const runCommandSchema = z.object({
	command_id: z.string().min(1).describe('要执行的 Obsidian command id。'),
}).strict();

export const runCommandResultSchema = z.object({
	command_id: z.string(),
	executed: z.boolean(),
	plugin: z.string().nullable().optional(),
}).strict();

export type RunCommandArgs = z.infer<typeof runCommandSchema>;
export type RunCommandResult = z.infer<typeof runCommandResultSchema>;

export const runCommandAnnotations = mutationToolAnnotations;
