import type { McpRuntimeManager } from 'src/domains/mcp/types'
import type { BuiltinTool } from '../../runtime/types'
import {
	createListMcpResourcesTool,
	LIST_MCP_RESOURCES_TOOL_NAME,
} from './list-mcp-resources/tool'
import {
	createReadMcpResourceTool,
	READ_MCP_RESOURCE_TOOL_NAME,
} from './read-mcp-resource/tool'

export {
	LIST_MCP_RESOURCES_TOOL_NAME,
	READ_MCP_RESOURCE_TOOL_NAME,
}

export const createMcpResourceTools = (manager: McpRuntimeManager): BuiltinTool[] => [
	createListMcpResourcesTool(manager),
	createReadMcpResourceTool(manager),
]
