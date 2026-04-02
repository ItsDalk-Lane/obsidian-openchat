import { z } from 'zod';

export const getFirstLinkPathSchema = z.object({
	internal_link: z
		.string()
		.min(1)
		.describe(
			'要解析的 Obsidian 内部链接文本。允许包含 [[]]、别名或标题；工具会先清理再查找。'
		),
}).strict();

export const getFirstLinkPathResultSchema = z.object({
	file_path: z.string().describe('解析后的文件路径（相对于 Vault 根目录）'),
	found: z.boolean().describe('是否找到文件'),
}).strict();

export const getFirstLinkPathAnnotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
} as const;

export type GetFirstLinkPathArgs = z.infer<typeof getFirstLinkPathSchema>;
export type GetFirstLinkPathResult = z.infer<typeof getFirstLinkPathResultSchema>;
