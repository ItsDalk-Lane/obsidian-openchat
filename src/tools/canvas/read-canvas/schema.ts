import { z } from 'zod'
import { readOnlyToolAnnotations } from '../../vault/filesystemToolSchemas'

export const readCanvasSchema = z.object({
	file_path: z
		.string()
		.min(1)
		.describe('已知 Canvas 文件路径；相对于 Vault 根目录，必须是 .canvas 文件'),
	text_preview_length: z
		.number()
		.int()
		.positive()
		.max(500)
		.default(120)
		.describe('文本节点预览的最大字符数，默认 120'),
}).strict()

export const readCanvasResultSchema = z.object({
	file_path: z.string(),
	summary: z.object({
		node_count: z.number().int().nonnegative(),
		edge_count: z.number().int().nonnegative(),
		node_types: z.record(z.string(), z.number().int().nonnegative()),
		bounds: z.object({
			left: z.number(),
			top: z.number(),
			right: z.number(),
			bottom: z.number(),
		}).nullable(),
	}).strict(),
	nodes: z.array(z.object({
		id: z.string(),
		type: z.string(),
		x: z.number(),
		y: z.number(),
		width: z.number(),
		height: z.number(),
		color: z.string().optional(),
		label: z.string(),
		text_preview: z.string().optional(),
		file: z.string().optional(),
		subpath: z.string().optional(),
		url: z.string().optional(),
	}).strict()),
	edges: z.array(z.object({
		id: z.string(),
		from_node: z.string(),
		to_node: z.string(),
		from_side: z.string().optional(),
		to_side: z.string().optional(),
		label: z.string().optional(),
		color: z.string().optional(),
	}).strict()),
}).strict()

export type ReadCanvasArgs = z.infer<typeof readCanvasSchema>
export type ReadCanvasResult = z.infer<typeof readCanvasResultSchema>

export const readCanvasAnnotations = readOnlyToolAnnotations
