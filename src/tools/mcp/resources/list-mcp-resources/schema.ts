import { z } from 'zod'
import { readOnlyToolAnnotations } from '../../../vault/filesystemToolSchemas'

export const listMcpResourcesSchema = z.object({
	server_id: z
		.string()
		.min(1)
		.optional()
		.describe('可选；只列出某个已启用 MCP server 的资源'),
	query: z
		.string()
		.min(1)
		.optional()
		.describe('可选；按 URI、名称、标题、描述或 MIME 类型筛选资源'),
	max_results: z
		.number()
		.int()
		.positive()
		.max(500)
		.default(100)
		.describe('最多返回多少条资源，默认 100，最大 500'),
}).strict()

export const listMcpResourcesResultSchema = z.object({
	total: z.number().int().nonnegative(),
	truncated: z.boolean(),
	resources: z.array(z.object({
		server_id: z.string(),
		server_name: z.string(),
		uri: z.string(),
		name: z.string(),
		title: z.string().optional(),
		description: z.string().optional(),
		mime_type: z.string().optional(),
		size: z.number().int().nonnegative().optional(),
	}).strict()),
}).strict()

export type ListMcpResourcesArgs = z.infer<typeof listMcpResourcesSchema>
export type ListMcpResourcesResult = z.infer<typeof listMcpResourcesResultSchema>

export const listMcpResourcesAnnotations = readOnlyToolAnnotations
