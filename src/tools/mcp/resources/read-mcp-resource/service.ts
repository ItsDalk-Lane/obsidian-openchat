import type {
	McpResourceContent,
	McpRuntimeManager,
} from 'src/domains/mcp/types'
import { DEFAULT_TOOL_RESULT_TEXT_LIMIT } from '../../../runtime/constants'
import type { BuiltinValidationResult } from '../../../runtime/types'
import type { ReadMcpResourceArgs, ReadMcpResourceResult } from './schema'

const normalizeRequired = (value: string): string => value.trim()

const truncateResourceValue = (value: string, label: string): {
	readonly value: string
	readonly truncated: boolean
} => {
	if (value.length <= DEFAULT_TOOL_RESULT_TEXT_LIMIT) {
		return { value, truncated: false }
	}
	return {
		value: `${value.slice(0, DEFAULT_TOOL_RESULT_TEXT_LIMIT)}\n\n[${label}已截断，请缩小资源范围后重试]`,
		truncated: true,
	}
}

const formatContent = (content: McpResourceContent) => {
	if ('text' in content) {
		const normalized = truncateResourceValue(content.text, '资源文本')
		return {
			uri: content.uri,
			...(content.mimeType ? { mime_type: content.mimeType } : {}),
			kind: 'text' as const,
			text: normalized.value,
			truncated: normalized.truncated,
		}
	}

	const normalized = truncateResourceValue(content.blob, '资源二进制内容(base64)')
	return {
		uri: content.uri,
		...(content.mimeType ? { mime_type: content.mimeType } : {}),
		kind: 'blob' as const,
		blob_base64: normalized.value,
		truncated: normalized.truncated,
	}
}

export const validateReadMcpResourceInput = (
	manager: McpRuntimeManager,
	args: ReadMcpResourceArgs,
): BuiltinValidationResult => {
	const enabledServers = manager.getEnabledServerSummaries()
	if (enabledServers.length === 0) {
		return {
			ok: false,
			summary: '当前没有已启用的 MCP server，无法读取资源。',
		}
	}
	if (enabledServers.some((entry) => entry.id === normalizeRequired(args.server_id))) {
		return { ok: true }
	}
	return {
		ok: false,
		summary: `未找到已启用的 MCP server: ${args.server_id}`,
		notes: ['请先用 list_mcp_resources 获取稳定的 server_id 与 uri。'],
	}
}

export const summarizeReadMcpResource = (
	args: Partial<ReadMcpResourceArgs>,
): string | null => {
	return args.uri?.trim() || args.server_id?.trim() || null
}

export const describeReadMcpResourceActivity = (
	args: Partial<ReadMcpResourceArgs>,
): string | null => {
	const uri = args.uri?.trim()
	return uri ? `读取 MCP 资源 ${uri}` : '读取 MCP 资源'
}

export const executeReadMcpResource = async (
	manager: McpRuntimeManager,
	args: ReadMcpResourceArgs,
	reportMessage?: (message: string) => void,
): Promise<ReadMcpResourceResult> => {
	const serverId = normalizeRequired(args.server_id)
	const uri = normalizeRequired(args.uri)
	const serverName = manager.getEnabledServerSummaries()
		.find((entry) => entry.id === serverId)?.name ?? serverId

	reportMessage?.(`正在读取 ${serverName} 的资源 ${uri}`)
	const contents = await manager.readResource(serverId, uri)
	return {
		server_id: serverId,
		server_name: serverName,
		uri,
		contents: contents.map((content) => formatContent(content)),
	}
}
