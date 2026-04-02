import assert from 'node:assert/strict'
import test from 'node:test'
import { McpHealthChecker } from './runtime/health-checker'
import { McpProcessManager } from './runtime/process-manager'
import { McpRuntimeManagerImpl } from './runtime/runtime-manager'
import type {
	McpDomainLogger,
	McpHealthResult,
	McpResourceContent,
	McpResourceInfo,
	McpServerConfig,
	McpServerState,
} from './types'

function createServerConfig(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
	return {
		id: 'server-1',
		name: 'Server 1',
		enabled: true,
		transportType: 'stdio',
		timeout: 30000,
		command: 'node',
		args: ['server.mjs'],
		...overrides,
	}
}

function createLogger(): McpDomainLogger {
	return {
		debug() {},
		info() {},
		warn() {},
		error() {},
	}
}

function createRuntimeDependencies(logger: McpDomainLogger) {
	return {
		logger,
		notify() {},
		async requestHttp() {
			throw new Error('not used in tests')
		},
	}
}

test('McpRuntimeManagerImpl 会按 server 读取资源列表', async () => {
	const resources: McpResourceInfo[] = [
		{
			serverId: 'server-1',
			uri: 'repo://docs/architecture',
			name: 'Architecture',
			mimeType: 'text/markdown',
		},
	]
	const fakeProcessManager = {
		getAllStates() {
			return [{ serverId: 'server-1', status: 'running', tools: [] } satisfies McpServerState]
		},
		getState() {
			return { serverId: 'server-1', status: 'running', tools: [] } satisfies McpServerState
		},
		async ensureConnected() {
			return {
				async listResources() {
					return resources
				},
			}
		},
		async disconnect() {},
		async dispose() {},
	} as unknown as McpProcessManager

	const manager = new McpRuntimeManagerImpl(
		{ enabled: true, servers: [createServerConfig()] },
		createRuntimeDependencies(createLogger()),
		{
			createProcessManager() {
				return fakeProcessManager
			},
			createHealthChecker() {
				return { async check(): Promise<McpHealthResult[]> { return [] } } as unknown as McpHealthChecker
			},
		},
	)

	const result = await manager.getResourcesForServer('server-1')
	assert.deepEqual(result, resources)
})

test('McpRuntimeManagerImpl 会把 readResource 委托给已连接客户端', async () => {
	const contents: McpResourceContent[] = [
		{
			uri: 'repo://docs/architecture',
			mimeType: 'text/markdown',
			text: '# Architecture',
		},
	]
	const fakeProcessManager = {
		getAllStates() { return [] },
		getState() { return undefined },
		async ensureConnected() {
			return {
				async readResource(uri: string) {
					assert.equal(uri, 'repo://docs/architecture')
					return contents
				},
			}
		},
		async disconnect() {},
		async dispose() {},
	} as unknown as McpProcessManager

	const manager = new McpRuntimeManagerImpl(
		{ enabled: true, servers: [createServerConfig()] },
		createRuntimeDependencies(createLogger()),
		{
			createProcessManager() {
				return fakeProcessManager
			},
			createHealthChecker() {
				return { async check(): Promise<McpHealthResult[]> { return [] } } as unknown as McpHealthChecker
			},
		},
	)

	const result = await manager.readResource('server-1', 'repo://docs/architecture')
	assert.deepEqual(result, contents)
})
