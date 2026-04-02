import type { McpResourceInfo, McpRuntimeManager } from 'src/domains/mcp/types'
import type { BuiltinValidationResult } from '../../../runtime/types'
import type { ListMcpResourcesArgs, ListMcpResourcesResult } from './schema'

interface ResourceWithServerName extends McpResourceInfo {
	readonly serverName: string
}

const normalizeOptional = (value?: string | null): string | null => {
	const trimmed = value?.trim()
	return trimmed ? trimmed : null
}

const buildSearchText = (resource: McpResourceInfo, serverName: string): string => {
	return [
		serverName,
		resource.uri,
		resource.name,
		resource.title,
		resource.description,
		resource.mimeType,
	]
		.filter((value) => typeof value === 'string' && value.trim().length > 0)
		.join('\n')
		.toLowerCase()
}

const matchesQuery = (resource: McpResourceInfo, serverName: string, query: string | null): boolean => {
	if (!query) {
		return true
	}
	return buildSearchText(resource, serverName).includes(query.toLowerCase())
}

const sortResources = (left: ResourceWithServerName, right: ResourceWithServerName): number => {
	return left.serverName.localeCompare(right.serverName)
		|| left.name.localeCompare(right.name)
		|| left.uri.localeCompare(right.uri)
}

const formatResource = (resource: ResourceWithServerName) => ({
	server_id: resource.serverId,
	server_name: resource.serverName,
	uri: resource.uri,
	name: resource.name,
	...(resource.title ? { title: resource.title } : {}),
	...(resource.description ? { description: resource.description } : {}),
	...(resource.mimeType ? { mime_type: resource.mimeType } : {}),
	...(typeof resource.size === 'number' ? { size: resource.size } : {}),
})

const resolveTargetServers = (
	manager: McpRuntimeManager,
	serverId?: string,
): Array<{ id: string; name: string }> => {
	const enabledServers = manager.getEnabledServerSummaries()
	if (!serverId) {
		return enabledServers
	}
	return enabledServers.filter((entry) => entry.id === serverId)
}

export const validateListMcpResourcesInput = (
	manager: McpRuntimeManager,
	args: ListMcpResourcesArgs,
): BuiltinValidationResult => {
	const enabledServers = manager.getEnabledServerSummaries()
	if (enabledServers.length === 0) {
		return {
			ok: false,
			summary: '当前没有已启用的 MCP server，无法列出资源。',
		}
	}
	const serverId = normalizeOptional(args.server_id)
	if (!serverId) {
		return { ok: true }
	}
	if (enabledServers.some((entry) => entry.id === serverId)) {
		return { ok: true }
	}
	return {
		ok: false,
		summary: `未找到已启用的 MCP server: ${serverId}`,
		notes: ['可先省略 server_id 查看全部已启用 server 的资源。'],
	}
}

export const summarizeListMcpResources = (
	args: Partial<ListMcpResourcesArgs>,
): string | null => {
	return normalizeOptional(args.server_id) ?? normalizeOptional(args.query)
}

export const describeListMcpResourcesActivity = (
	args: Partial<ListMcpResourcesArgs>,
): string | null => {
	const serverId = normalizeOptional(args.server_id)
	if (serverId) {
		return `列出 MCP 资源 ${serverId}`
	}
	return '列出 MCP 资源'
}

export const executeListMcpResources = async (
	manager: McpRuntimeManager,
	args: ListMcpResourcesArgs,
	reportMessage?: (message: string) => void,
): Promise<ListMcpResourcesResult> => {
	const servers = resolveTargetServers(manager, normalizeOptional(args.server_id) ?? undefined)
	const query = normalizeOptional(args.query)
	const resources: ResourceWithServerName[] = []

	reportMessage?.(`正在列出 ${servers.length} 个 MCP server 的资源`)
	for (const server of servers) {
		const items = await manager.getResourcesForServer(server.id)
		reportMessage?.(`已读取 ${server.name} 的 ${items.length} 个资源`)
		for (const item of items) {
			if (matchesQuery(item, server.name, query)) {
				resources.push({ ...item, serverName: server.name })
			}
		}
	}

	const sorted = resources.sort(sortResources)
	const limited = sorted.slice(0, args.max_results)
	return {
		total: sorted.length,
		truncated: sorted.length > limited.length,
		resources: limited.map((resource) => formatResource(resource)),
	}
}
