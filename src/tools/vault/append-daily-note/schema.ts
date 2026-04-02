import { z } from 'zod';
import { mutationToolAnnotations } from '../filesystemToolSchemas';

export const appendDailyNoteSchema = z.object({
	date: z
		.string()
		.optional()
		.describe('目标日期，格式为 YYYY-MM-DD；省略时默认今天。'),
	content: z
		.string()
		.min(1)
		.describe('要追加到 daily note 的正文内容。'),
	section_heading: z
		.string()
		.optional()
		.describe('目标标题文本；存在时追加到该标题下，不存在时自动补出标题。'),
}).strict();

export const appendDailyNoteResultSchema = z.object({
	file_path: z.string(),
	created: z.boolean(),
	updated: z.boolean(),
	inserted_under_heading: z.string().nullable(),
}).strict();

export type AppendDailyNoteArgs = z.infer<typeof appendDailyNoteSchema>;
export type AppendDailyNoteResult = z.infer<typeof appendDailyNoteResultSchema>;

export const appendDailyNoteAnnotations = mutationToolAnnotations;
