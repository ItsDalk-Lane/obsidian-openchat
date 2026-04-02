import { z } from 'zod';

export const bingSearchSchema = z.object({
	query: z.string().min(1).describe('搜索关键词或查询语句'),
	count: z
		.number()
		.int()
		.min(1)
		.max(50)
		.default(10)
		.describe('返回的搜索结果数量，默认 10，范围 1-50'),
	offset: z
		.number()
		.int()
		.min(0)
		.default(0)
		.describe('结果偏移量，用于分页，默认 0'),
}).strict();

export type BingSearchArgs = z.infer<typeof bingSearchSchema>;

export const bingSearchAnnotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: true,
} as const;
