import type { McpRuntimeManager } from 'src/domains/mcp/types'
import { buildBuiltinTool } from '../../../runtime/build-tool'
import { READ_MCP_RESOURCE_DESCRIPTION } from './description'
import {
	describeReadMcpResourceActivity,
	executeReadMcpResource,
	summarizeReadMcpResource,
	validateReadMcpResourceInput,
} from './service'
import {
	readMcpResourceAnnotations,
	readMcpResourceResultSchema,
	readMcpResourceSchema,
	type ReadMcpResourceArgs,
	type ReadMcpResourceResult,
} from './schema'

export const READ_MCP_RESOURCE_TOOL_NAME = 'read_mcp_resource'

export const createReadMcpResourceTool = (
	manager: McpRuntimeManager,
) => buildBuiltinTool<ReadMcpResourceArgs, ReadMcpResourceResult>({
	name: READ_MCP_RESOURCE_TOOL_NAME,
	title: '读取 MCP 资源',
	description: READ_MCP_RESOURCE_DESCRIPTION,
	inputSchema: readMcpResourceSchema,
	outputSchema: readMcpResourceResultSchema,
	annotations: readMcpResourceAnnotations,
	surface: {
		family: 'builtin.mcp.resources.read',
		visibility: 'candidate-only',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '读取一个已知 MCP 资源的内容。',
		whenToUse: [
			'已经通过 list_mcp_resources 拿到精确 server_id 与 uri',
			'需要把 MCP 资源作为只读上下文读取',
		],
		whenNotToUse: [
			'不知道 uri 时不要猜测，应先用 list_mcp_resources',
			'需要执行 MCP 工具或写入资源时不要使用当前工具',
		],
		capabilityTags: [
			'mcp',
			'resource',
			'read resource',
			'uri',
			'资源',
			'读取资源',
		],
		requiredArgsSummary: ['server_id', 'uri'],
	},
	isReadOnly: () => true,
	isConcurrencySafe: () => true,
	validateInput: (args) => validateReadMcpResourceInput(manager, args),
	getToolUseSummary: summarizeReadMcpResource,
	getActivityDescription: describeReadMcpResourceActivity,
	execute: async (args, context) => await executeReadMcpResource(
		manager,
		args,
		(message) => context.reportProgress?.({ message }),
	),
})
