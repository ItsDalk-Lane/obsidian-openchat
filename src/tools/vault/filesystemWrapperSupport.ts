import { z } from 'zod';
import type { ListDirectoryArgs } from './filesystemToolSchemas';

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

export const listVaultOverviewSchema = z.object({
	file_extensions: z
		.array(z.string().min(1))
		.optional()
		.default([])
		.describe('文件扩展名过滤数组，例如 ["md", "ts"]，元素不要带点号'),
	vault_limit: z
		.number()
		.int()
		.positive()
		.max(5_000)
		.default(1_000)
		.describe('最多返回多少条文件路径，默认 1000，最大 5000'),
}).strict();

export type ListDirectoryTreeArgs = z.infer<typeof listDirectoryTreeSchema>;
export type ListVaultOverviewArgs = z.infer<typeof listVaultOverviewSchema>;
export type ListDirectoryFlatArgs = z.infer<typeof listDirectoryFlatSchema>;

export const buildListDirectoryFlatArgs = (
	input: ListDirectoryFlatArgs,
): ListDirectoryArgs => ({
	directory_path: input.directory_path,
	view: 'flat',
	include_sizes: input.include_sizes,
	sort_by: input.sort_by,
	regex: input.regex,
	limit: input.limit,
	offset: input.offset,
	response_format: 'json',
});

export const buildListDirectoryTreeArgs = (
	input: ListDirectoryTreeArgs,
): ListDirectoryArgs => ({
	directory_path: input.directory_path,
	view: 'tree',
	exclude_patterns: input.exclude_patterns,
	max_depth: input.max_depth,
	max_nodes: input.max_nodes,
	response_format: 'json',
});

export const buildListVaultOverviewArgs = (
	input: ListVaultOverviewArgs,
): ListDirectoryArgs => ({
	directory_path: '/',
	view: 'vault',
	file_extensions: input.file_extensions,
	vault_limit: input.vault_limit,
	response_format: 'json',
});