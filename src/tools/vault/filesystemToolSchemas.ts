import { z } from 'zod';

export const responseFormatSchema = z
	.enum(['json', 'text'])
	.default('json')
	.describe("返回格式：json 为稳定对象，text 为紧凑文本");

export const structuredOutputSchema = z.object({}).passthrough();

export const readOnlyToolAnnotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
} as const;

export const mutationToolAnnotations = {
	readOnlyHint: false,
	destructiveHint: true,
	idempotentHint: false,
	openWorldHint: false,
} as const;

export const DEFAULT_READ_SEGMENT_LINES = 200;
export const MAX_READ_SEGMENT_LINES = 1_000;

export const readTextFileSchema = z.object({
	file_path: z
		.string()
		.min(1)
		.describe('已知文本文件路径；相对于 Vault 根目录'),
	read_mode: z
		.enum(['full', 'segment', 'head', 'tail'])
		.default('segment')
		.describe(
			"读取模式：segment 分段读取，full 尝试一次读完整篇，head 只读开头，tail 只读结尾"
		),
	start_line: z
		.number()
		.int()
		.positive()
		.optional()
		.describe('仅 segment 模式可用；从第几行开始读取，第一行为 1，默认 1'),
	line_count: z
		.number()
		.int()
		.positive()
		.max(MAX_READ_SEGMENT_LINES)
		.default(DEFAULT_READ_SEGMENT_LINES)
		.describe(
			`segment/head/tail 模式读取的行数，默认 ${DEFAULT_READ_SEGMENT_LINES}，最大 ${MAX_READ_SEGMENT_LINES}`
		),
	response_format: responseFormatSchema,
}).strict();

export const readMediaFileSchema = z.object({
	file_path: z
		.string()
		.min(1)
		.describe('已知媒体文件路径；相对于 Vault 根目录，仅支持图片或音频'),
}).strict();

export const readMultipleFilesSchema = z.object({
	file_paths: z
		.array(z.string().min(1))
		.min(1)
		.max(20)
		.describe('已知文件路径数组，最多 20 个'),
	read_mode: z
		.enum(['segment', 'head'])
		.default('segment')
		.describe(
			"批量读取模式：segment 读取每个文件的指定片段，head 读取每个文件的开头片段"
		),
	start_line: z
		.number()
		.int()
		.positive()
		.optional()
		.describe('仅 segment 模式可用；每个文件从第几行开始读取，第一行为 1，默认 1'),
	line_count: z
		.number()
		.int()
		.positive()
		.max(MAX_READ_SEGMENT_LINES)
		.default(Math.min(80, DEFAULT_READ_SEGMENT_LINES))
		.describe('每个文件返回的行数，用于批量预览，最大 1000'),
	response_format: responseFormatSchema,
}).strict();

export const writeFileSchema = z.object({
	file_path: z
		.string()
		.min(1)
		.describe('目标文本文件路径；相对于 Vault 根目录'),
	content: z.string().describe('要写入文件的完整文本内容，会覆盖原文件'),
}).strict();

export const editFileSchema = z.object({
	file_path: z
		.string()
		.min(1)
		.describe('已知文本文件路径；相对于 Vault 根目录'),
	edits: z
		.array(
			z
				.object({
					oldText: z.string().describe('待替换的原文本，必须能在文件中找到'),
					newText: z.string().describe('替换后的新文本'),
				})
				.strict()
		)
		.min(1)
		.describe('编辑操作列表，按顺序执行'),
	dry_run: z
		.boolean()
		.default(false)
		.describe('是否只返回 diff 预览而不真正写入，默认 false'),
}).strict();

export const directoryPathSchema = z.object({
	directory_path: z
		.string()
		.min(1)
		.describe('目录路径；相对于 Vault 根目录，根目录可传 /'),
}).strict();

export const listDirectorySchema = z.object({
	directory_path: z
		.string()
		.min(1)
		.optional()
		.default('/')
		.describe(
			'目录路径；相对于 Vault 根目录，根目录可传 /。flat/tree 模式按该目录浏览，vault 模式只能省略或传 /'
		),
	view: z
		.enum(['flat', 'tree', 'vault'])
		.default('flat')
		.describe(
			"浏览模式：flat 为单层目录浏览，tree 为递归目录树，vault 为整个 Vault 的轻量文件路径视图"
		),
	include_sizes: z
		.boolean()
		.default(false)
		.describe('仅 flat 模式可用；返回文件大小与目录汇总'),
	sort_by: z
		.enum(['name', 'size'])
		.default('name')
		.describe("仅 flat 模式可用；返回结果按名称或大小排序"),
	regex: z
		.string()
		.optional()
		.describe('仅 flat 模式可用；按名称过滤目录项的 JavaScript 正则表达式'),
	exclude_patterns: z
		.array(z.string())
		.optional()
		.default([])
		.describe('仅 tree 模式可用；排除的 glob 模式列表'),
	limit: z
		.number()
		.int()
		.positive()
		.max(500)
		.default(100)
		.describe('仅 flat 模式可用；分页返回时每页最多返回多少个目录项，默认 100。'),
	offset: z
		.number()
		.int()
		.min(0)
		.default(0)
		.describe('仅 flat 模式可用；分页偏移量，默认从第 0 个结果开始。'),
	max_depth: z
		.number()
		.int()
		.positive()
		.max(20)
		.default(5)
		.describe('仅 tree 模式可用；递归展开目录树的最大深度，默认 5。'),
	max_nodes: z
		.number()
		.int()
		.positive()
		.max(2_000)
		.default(200)
		.describe('仅 tree 模式可用；目录树最多返回的节点数量，默认 200。'),
	file_extensions: z
		.array(z.string().min(1))
		.optional()
		.default([])
		.describe('仅 vault 模式可用；文件扩展名过滤数组，例如 ["md", "ts"]，元素不要带点号'),
	vault_limit: z
		.number()
		.int()
		.positive()
		.max(5_000)
		.default(1_000)
		.describe('仅 vault 模式可用；最多返回多少条文件路径，默认 1000，最大 5000'),
	response_format: responseFormatSchema,
}).strict();

export const moveFileSchema = z.object({
	source_path: z
		.string()
		.min(1)
		.describe('源文件或文件夹路径；相对于 Vault 根目录'),
	destination_path: z
		.string()
		.min(1)
		.describe('目标文件或文件夹路径；相对于 Vault 根目录'),
}).strict();

export const findPathsSchema = z.object({
	query: z
		.string()
		.min(1)
		.describe('要查找的文件名、目录名或路径片段；当只知道名称不知道路径时使用'),
	scope_path: z
		.string()
		.optional()
		.default('/')
		.describe('限制查找范围的目录路径；默认为整个 Vault'),
	target_type: z
		.enum(['any', 'file', 'directory'])
		.default('any')
		.describe('限定查找文件、目录或两者'),
	match_mode: z
		.enum(['contains', 'exact', 'prefix', 'suffix', 'glob'])
		.default('contains')
		.describe("名称匹配方式：默认 contains，支持 exact/prefix/suffix/glob"),
	max_results: z
		.number()
		.int()
		.positive()
		.max(500)
		.default(100)
		.describe('返回结果的最大数量，默认 100'),
	response_format: responseFormatSchema,
}).strict();

export const getFileInfoSchema = z.object({
	target_path: z
		.string()
		.min(1)
		.describe('已知文件或目录路径；相对于 Vault 根目录，根目录可传 /'),
	response_format: responseFormatSchema,
}).strict();

export const deleteFileSchema = z.object({
	target_path: z
		.string()
		.min(1)
		.describe('要删除的文件或文件夹路径；相对于 Vault 根目录'),
	force: z
		.boolean()
		.optional()
		.default(true)
		.describe('删除文件夹时是否强制递归删除隐藏内容，默认 true'),
}).strict();

export type ReadTextFileArgs = z.infer<typeof readTextFileSchema>;
export type ReadMultipleFilesArgs = z.infer<typeof readMultipleFilesSchema>;
export type ListDirectoryArgs = z.infer<typeof listDirectorySchema>;
