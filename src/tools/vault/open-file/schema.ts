import { z } from 'zod';

export const openFileSchema = z.object({
	file_path: z
		.string()
		.min(1)
		.describe('已知文件路径；相对于 Vault 根目录。仅在已经知道准确文件路径时使用'),
	open_in_new_panel: z
		.boolean()
		.default(false)
		.optional()
		.describe('是否在新的编辑面板中打开文件，默认 false'),
}).strict();

export const openFileResultSchema = z.object({
	file_path: z.string(),
	open_in_new_panel: z.boolean(),
	opened: z.boolean(),
});
