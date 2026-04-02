import { z } from 'zod';

export const listDirectoryTreeSchema = z.object({
	directory_path: z
		.string()
		.min(1)
		.optional()
		.default('/')
		.describe('目录路径；相对于 Vault 根目录，根目录可传 /'),
	exclude_patterns: z
		.array(z.string())
		.optional()
		.default([])
		.describe('排除的 glob 模式列表'),
	max_depth: z
		.number()
		.int()
		.positive()
		.max(20)
		.default(5)
		.describe('递归展开目录树的最大深度，默认 5'),
	max_nodes: z
		.number()
		.int()
		.positive()
		.max(2_000)
		.default(200)
		.describe('目录树最多返回的节点数量，默认 200'),
}).strict();

export type ListDirectoryTreeArgs = z.infer<typeof listDirectoryTreeSchema>;
