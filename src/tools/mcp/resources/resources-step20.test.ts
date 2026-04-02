import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import type {
	McpHealthResult,
	McpResourceContent,
	McpResourceInfo,
	McpRuntimeManager,
	McpServerState,
	McpSettings,
	McpToolDefinition,
	McpToolInfo,
} from 'src/domains/mcp/types'
import {
	executeListMcpResources,
} from './list-mcp-resources/service'
import {
	listMcpResourcesResultSchema,
	listMcpResourcesSchema,
} from './list-mcp-resources/schema'
import {
	executeReadMcpResource,
} from './read-mcp-resource/service'
import {
	readMcpResourceResultSchema,
	readMcpResourceSchema,
} from './read-mcp-resource/schema'

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url))

const readMcpToolSource = async (relativePath: string): Promise<string> => {
	return await readFile(resolve(CURRENT_DIR, relativePath), 'utf8')
}

class FakeMcpRuntimeManager implements McpRuntimeManager {
	constructor(
		private readonly resourcesByServer: Record<string, McpResourceInfo[]>,
		private readonly contentByKey: Record<string, McpResourceContent[]>,
	) {}

	getSettings(): McpSettings {
		return { enabled: true, servers: [] }
	}

	async updateSettings(): Promise<void> {}

	async getAvailableTools(): Promise<McpToolDefinition[]> { return [] }

	async getAvailableToolsWithLazyStart(): Promise<McpToolDefinition[]> { return [] }

	async getToolsForModelContext(): Promise<McpToolDefinition[]> { return [] }

	async callTool(): Promise<string> { return '' }

	async callActualTool(): Promise<string> { return '' }

	async connectServer(): Promise<void> {}

	async disconnectServer(): Promise<void> {}

	async checkHealth(): Promise<McpHealthResult[]> { return [] }

	getEnabledServerSummaries(): Array<{ id: string; name: string }> {
		return [
			{ id: 'github', name: 'GitHub' },
			{ id: 'docs', name: 'Docs' },
		]
	}

	getAllStates(): McpServerState[] { return [] }

	getState(): McpServerState | undefined { return undefined }

	async getToolsForServer(): Promise<McpToolInfo[]> { return [] }

	async getResourcesForServer(serverId: string): Promise<McpResourceInfo[]> {
		return this.resourcesByServer[serverId] ?? []
	}

	async readResource(serverId: string, uri: string): Promise<McpResourceContent[]> {
		return this.contentByKey[`${serverId}::${uri}`] ?? []
	}

	onStateChange(): () => void { return () => {} }

	dispose(): void {}
}

test('Step 20 schema 约束 server_id + uri，并保持 list/read 只读边界', () => {
	const listArgs = listMcpResourcesSchema.parse({})
	const readArgs = readMcpResourceSchema.parse({
		server_id: 'github',
		uri: 'repo://openchat/docs/architecture',
	})

	assert.equal(listArgs.max_results, 100)
	assert.equal(readArgs.server_id, 'github')
	assert.equal(readArgs.uri, 'repo://openchat/docs/architecture')
	assert.deepEqual(Object.keys(listMcpResourcesResultSchema.shape).sort(), [
		'resources',
		'total',
		'truncated',
	])
	assert.deepEqual(Object.keys(readMcpResourceResultSchema.shape).sort(), [
		'contents',
		'server_id',
		'server_name',
		'uri',
	])
})

test('Step 20 service 会先列资源再按精确 server_id + uri 读取，并避免模型猜 URI', async () => {
	const manager = new FakeMcpRuntimeManager(
		{
			github: [
				{
					serverId: 'github',
					uri: 'repo://openchat/docs/architecture',
					name: 'Architecture',
					description: '系统架构文档',
					mimeType: 'text/markdown',
				},
				{
					serverId: 'github',
					uri: 'repo://openchat/docs/roadmap',
					name: 'Roadmap',
					description: '路线图文档',
					mimeType: 'text/markdown',
				},
			],
			docs: [
				{
					serverId: 'docs',
					uri: 'docs://api/reference',
					name: 'API Reference',
					title: 'Reference',
					mimeType: 'text/html',
				},
			],
		},
		{
			'github::repo://openchat/docs/architecture': [
				{
					uri: 'repo://openchat/docs/architecture',
					mimeType: 'text/markdown',
					text: '# Architecture\n'.repeat(3000),
				},
			],
			'docs::docs://api/reference': [
				{
					uri: 'docs://api/reference',
					mimeType: 'application/octet-stream',
					blob: 'YWJj'.repeat(10000),
				},
			],
		},
	)

	const listed = await executeListMcpResources(manager, {
		server_id: 'github',
		query: 'road',
		max_results: 5,
	})
	const readText = await executeReadMcpResource(manager, {
		server_id: 'github',
		uri: 'repo://openchat/docs/architecture',
	})
	const readBlob = await executeReadMcpResource(manager, {
		server_id: 'docs',
		uri: 'docs://api/reference',
	})

	assert.equal(listed.total, 1)
	assert.equal(listed.resources[0]?.server_id, 'github')
	assert.equal(listed.resources[0]?.uri, 'repo://openchat/docs/roadmap')
	assert.equal(readText.contents[0]?.kind, 'text')
	assert.equal(readText.contents[0]?.truncated, true)
	assert.match(readText.contents[0]?.text ?? '', /\[资源文本已截断/)
	assert.equal(readBlob.contents[0]?.kind, 'blob')
	assert.equal(readBlob.contents[0]?.truncated, true)
	assert.match(readBlob.contents[0]?.blob_base64 ?? '', /\[资源二进制内容\(base64\)已截断/)
})

test('Step 20 runtime 已接入 MCP resource 工具工厂与 builtin runtime', async () => {
	const listToolSource = await readMcpToolSource('./list-mcp-resources/tool.ts')
	const readToolSource = await readMcpToolSource('./read-mcp-resource/tool.ts')
	const resourceToolsSource = await readMcpToolSource('./mcp-resource-tools.ts')
	const runtimeSource = await readMcpToolSource('../../runtime/BuiltinToolsRuntime.ts')

	assert.match(listToolSource, /LIST_MCP_RESOURCES_TOOL_NAME = 'list_mcp_resources'/)
	assert.match(listToolSource, /family: 'builtin\.mcp\.resources'/)
	assert.match(readToolSource, /READ_MCP_RESOURCE_TOOL_NAME = 'read_mcp_resource'/)
	assert.match(readToolSource, /family: 'builtin\.mcp\.resources\.read'/)
	assert.match(readToolSource, /不知道 uri 时不要猜测/)
	assert.match(resourceToolsSource, /createListMcpResourcesTool\(manager\)/)
	assert.match(resourceToolsSource, /createReadMcpResourceTool\(manager\)/)
	assert.match(runtimeSource, /createMcpResourceTools/)
	assert.match(runtimeSource, /registry\.registerAll\(createMcpResourceTools\(options\.mcpManager\)\)/)
})
