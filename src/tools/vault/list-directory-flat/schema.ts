import { z } from 'zod';

export const listDirectoryFlatSchema = z.object({
	directory_path: z
		.string()
		.min(1)
		.optional()
		.default('/')
		.describe('目录路径；相对于 Vault 根目录，根目录可传 /'),
	include_sizes: z
		.boolean()
		.default(false)
		.describe('是否返回文件大小与目录汇总'),
	sort_by: z
		.enum(['name', 'size'])
		.default('name')
		.describe('返回结果按名称或大小排序'),
	regex: z
		.string()
		.optional()
		.describe('按名称过滤目录项的 JavaScript 正则表达式'),
	limit: z
		.number()
		.int()
		.positive()
		.max(500)
		.default(100)
		.describe('每页最多返回多少个目录项，默认 100'),
	offset: z
		.number()
		.int()
		.min(0)
		.default(0)
		.describe('分页偏移量，默认从第 0 个结果开始'),
}).strict();

export type ListDirectoryFlatArgs = z.infer<typeof listDirectoryFlatSchema>;
