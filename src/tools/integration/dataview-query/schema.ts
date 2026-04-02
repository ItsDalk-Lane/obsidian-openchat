import { z } from 'zod'
import { readOnlyToolAnnotations } from '../../vault/filesystemToolSchemas'

export const dataviewQuerySchema = z.object({
	query: z
		.string()
		.trim()
		.min(1)
		.max(8_000)
		.describe('Dataview 查询文本，例如 TABLE file.name FROM #project'),
	origin_file_path: z
		.string()
		.trim()
		.min(1)
		.optional()
		.describe(
			'可选的查询上下文文件路径；当查询里使用 this 或相对链接解析时建议传入'
		),
	max_rows: z
		.number()
		.int()
		.positive()
		.max(200)
		.default(50)
		.describe('最多返回多少行结构化预览，默认 50，最大 200'),
	max_cell_length: z
		.number()
		.int()
		.positive()
		.max(1_000)
		.default(200)
		.describe('每个单元格字符串预览的最大长度，默认 200'),
	markdown_preview_length: z
		.number()
		.int()
		.positive()
		.max(12_000)
		.default(4_000)
		.describe('Dataview Markdown 结果预览的最大长度，默认 4000'),
}).strict()

export const dataviewQueryResultSchema = z.object({
	query: z.string(),
	origin_file_path: z.string().nullable(),
	plugin_version: z.string().nullable(),
	result_type: z.string(),
	row_count: z.number().int().nonnegative(),
	headers: z.array(z.string()),
	rows: z.array(z.array(z.string())),
	markdown: z.string().optional(),
	truncated: z.boolean(),
	notes: z.array(z.string()),
}).strict()

export type DataviewQueryArgs = z.infer<typeof dataviewQuerySchema>
export type DataviewQueryResult = z.infer<typeof dataviewQueryResultSchema>

export const dataviewQueryAnnotations = readOnlyToolAnnotations
