import type { McpRuntimeManager } from 'src/domains/mcp/types'
import { buildBuiltinTool } from '../../../runtime/build-tool'
import { LIST_MCP_RESOURCES_DESCRIPTION } from './description'
import {
	describeListMcpResourcesActivity,
	executeListMcpResources,
	summarizeListMcpResources,
	validateListMcpResourcesInput,
} from './service'
import {
	listMcpResourcesAnnotations,
	listMcpResourcesResultSchema,
	listMcpResourcesSchema,
	type ListMcpResourcesArgs,
	type ListMcpResourcesResult,
} from './schema'

export const LIST_MCP_RESOURCES_TOOL_NAME = 'list_mcp_resources'

export const createListMcpResourcesTool = (
	manager: McpRuntimeManager,
) => buildBuiltinTool<ListMcpResourcesArgs, ListMcpResourcesResult>({
	name: LIST_MCP_RESOURCES_TOOL_NAME,
	title: '列出 MCP 资源',
	description: LIST_MCP_RESOURCES_DESCRIPTION,
	inputSchema: listMcpResourcesSchema,
	outputSchema: listMcpResourcesResultSchema,
	annotations: listMcpResourcesAnnotations,
	surface: {
		family: 'builtin.mcp.resources',
		visibility: 'candidate-only',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '发现当前已连接 MCP server 暴露的资源。',
		whenToUse: [
			'读取 MCP 资源前先发现稳定的 server_id 和 uri',
			'需要按 server 或关键词筛选资源',
		],
		whenNotToUse: [
			'已经拿到精确 server_id 和 uri 时改用 read_mcp_resource',
			'需要执行 MCP 工具时不要使用当前工具',
		],
		capabilityTags: [
			'mcp',
			'resource',
			'resources',
			'discover',
			'uri',
			'资源',
			'列出资源',
		],
	},
	isReadOnly: () => true,
	isConcurrencySafe: () => true,
	validateInput: (args) => validateListMcpResourcesInput(manager, args),
	getToolUseSummary: summarizeListMcpResources,
	getActivityDescription: describeListMcpResourcesActivity,
	execute: async (args, context) => await executeListMcpResources(
		manager,
		args,
		(message) => context.reportProgress?.({ message }),
	),
})
