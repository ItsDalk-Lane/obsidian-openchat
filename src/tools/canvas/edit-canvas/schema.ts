import { z } from 'zod'
import { mutationToolAnnotations } from '../../vault/filesystemToolSchemas'

const canvasNodeTypeSchema = z.enum(['text', 'file', 'link', 'group'])
const canvasSideSchema = z.enum(['top', 'right', 'bottom', 'left'])
const customDataSchema = z.record(z.string(), z.unknown())

const canvasNodeDraftSchema = z.object({
	id: z.string().min(1),
	type: canvasNodeTypeSchema,
	x: z.number(),
	y: z.number(),
	width: z.number().positive(),
	height: z.number().positive(),
	color: z.string().optional(),
	text: z.string().optional(),
	file: z.string().optional(),
	subpath: z.string().optional(),
	url: z.string().optional(),
	label: z.string().optional(),
	custom_data: customDataSchema.optional(),
}).strict().superRefine((value, ctx) => {
	if (value.type === 'text' && (!value.text || value.text.trim().length === 0)) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'text 节点必须提供 text' })
	}
	if (value.type === 'file' && (!value.file || value.file.trim().length === 0)) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'file 节点必须提供 file' })
	}
	if (value.type === 'link' && (!value.url || value.url.trim().length === 0)) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'link 节点必须提供 url' })
	}
})

const canvasNodePatchSchema = z.object({
	x: z.number().optional(),
	y: z.number().optional(),
	width: z.number().positive().optional(),
	height: z.number().positive().optional(),
	color: z.string().optional(),
	text: z.string().optional(),
	file: z.string().optional(),
	subpath: z.string().optional(),
	url: z.string().optional(),
	label: z.string().optional(),
	custom_data: customDataSchema.optional(),
}).strict()

const canvasEdgeDraftSchema = z.object({
	id: z.string().min(1),
	from_node: z.string().min(1),
	to_node: z.string().min(1),
	from_side: canvasSideSchema.optional(),
	to_side: canvasSideSchema.optional(),
	label: z.string().optional(),
	color: z.string().optional(),
	custom_data: customDataSchema.optional(),
}).strict()

const canvasEdgePatchSchema = z.object({
	from_node: z.string().min(1).optional(),
	to_node: z.string().min(1).optional(),
	from_side: canvasSideSchema.optional(),
	to_side: canvasSideSchema.optional(),
	label: z.string().optional(),
	color: z.string().optional(),
	custom_data: customDataSchema.optional(),
}).strict()

export const editCanvasOperationSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('add_node'),
		node: canvasNodeDraftSchema,
	}).strict(),
	z.object({
		action: z.literal('update_node'),
		node_id: z.string().min(1),
		patch: canvasNodePatchSchema,
	}).strict(),
	z.object({
		action: z.literal('move_node'),
		node_id: z.string().min(1),
		x: z.number(),
		y: z.number(),
	}).strict(),
	z.object({
		action: z.literal('remove_node'),
		node_id: z.string().min(1),
		remove_connected_edges: z.boolean().optional().default(true),
	}).strict(),
	z.object({
		action: z.literal('add_edge'),
		edge: canvasEdgeDraftSchema,
	}).strict(),
	z.object({
		action: z.literal('update_edge'),
		edge_id: z.string().min(1),
		patch: canvasEdgePatchSchema,
	}).strict(),
	z.object({
		action: z.literal('remove_edge'),
		edge_id: z.string().min(1),
	}).strict(),
])

export const editCanvasSchema = z.object({
	file_path: z
		.string()
		.min(1)
		.describe('目标 Canvas 文件路径；相对于 Vault 根目录，必须是 .canvas 文件'),
	operations: z
		.array(editCanvasOperationSchema)
		.min(1)
		.describe('Canvas 结构化编辑操作列表'),
}).strict()

export const editCanvasResultSchema = z.object({
	file_path: z.string(),
	operations_applied: z.number().int().nonnegative(),
	node_count: z.number().int().nonnegative(),
	edge_count: z.number().int().nonnegative(),
	updated_node_ids: z.array(z.string()),
	updated_edge_ids: z.array(z.string()),
	removed_node_ids: z.array(z.string()),
	removed_edge_ids: z.array(z.string()),
	diff_preview: z.string().optional(),
}).strict()

export type EditCanvasArgs = z.infer<typeof editCanvasSchema>
export type EditCanvasOperation = z.infer<typeof editCanvasOperationSchema>
export type EditCanvasResult = z.infer<typeof editCanvasResultSchema>

export const editCanvasAnnotations = mutationToolAnnotations
