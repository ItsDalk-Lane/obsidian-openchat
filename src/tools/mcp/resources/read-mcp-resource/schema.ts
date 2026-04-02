import { z } from 'zod'
import { readOnlyToolAnnotations } from '../../../vault/filesystemToolSchemas'

export const readMcpResourceSchema = z.object({
	server_id: z
		.string()
		.min(1)
		.describe('资源所属的 MCP server id；应来自 list_mcp_resources 返回值'),
	uri: z
		.string()
		.min(1)
		.describe('要读取的精确资源 URI；应来自 list_mcp_resources 返回值'),
}).strict()

export const readMcpResourceResultSchema = z.object({
	server_id: z.string(),
	server_name: z.string(),
	uri: z.string(),
	contents: z.array(z.object({
		uri: z.string(),
		mime_type: z.string().optional(),
		kind: z.enum(['text', 'blob']),
		text: z.string().optional(),
		blob_base64: z.string().optional(),
		truncated: z.boolean(),
	}).strict()),
}).strict()

export type ReadMcpResourceArgs = z.infer<typeof readMcpResourceSchema>
export type ReadMcpResourceResult = z.infer<typeof readMcpResourceResultSchema>

export const readMcpResourceAnnotations = readOnlyToolAnnotations
