import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MCP_SETTINGS, resolveMcpRuntimeSettings } from './config';
import { McpDomainService } from './service';
import { McpRuntimeCoordinator } from './ui';
import type {
	McpDomainLogger,
	McpRuntimeManager,
	McpServerConfig,
	McpServerState,
	McpServerStatus,
	McpSettings,
	McpToolInfo,
} from './types';
import { McpRuntimeManagerImpl } from './runtime/runtime-manager';
import { McpProcessManager } from './runtime/process-manager';
import { McpHealthChecker } from './runtime/health-checker';
import {
	McpJsonRpcError,
	previewProtocolClientArgs,
	isBusinessLevelMcpError,
	isRetryableToolCallError,
	shouldReconnectRemoteTransport,
} from './runtime/protocol-client-helpers';
import { createMcpTransport, isMcpRemoteTransport } from './transport/transport-factory';
import { HttpTransport } from './transport/http-transport';
import { RemoteSseTransport } from './transport/remote-sse-transport';
import { StdioTransport } from './transport/stdio-transport';
import { WebSocketTransport } from './transport/websocket-transport';

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
	};
}

function createTool(serverId = 'server-1', name = 'search'): McpToolInfo {
	return {
		serverId,
		name,
		description: `${name} tool`,
		inputSchema: { type: 'object' },
	};
}

function createLogger(): {
	entries: Array<{ level: string; message: string; metadata?: unknown }>;
	logger: McpDomainLogger;
} {
	const entries: Array<{ level: string; message: string; metadata?: unknown }> = [];
	const push = (level: string, message: string, metadata?: unknown) => {
		entries.push({ level, message, metadata });
	};
	return {
		entries,
		logger: {
			debug(message, metadata) { push('debug', message, metadata); },
			info(message, metadata) { push('info', message, metadata); },
			warn(message, metadata) { push('warn', message, metadata); },
			error(message, metadata) { push('error', message, metadata); },
		},
	};
}

function createRuntimeDependencies(logger: McpDomainLogger) {
	return {
		logger,
		notify() {},
		async requestHttp() {
			throw new Error('not used in tests');
		},
	};
}

function createFakeManager(): McpRuntimeManager & {
	updateCalls: McpSettings[];
	disposed: boolean;
} {
	let settings = resolveMcpRuntimeSettings();
	return {
		updateCalls: [],
		disposed: false,
		getSettings() {
			return settings;
		},
		async updateSettings(nextSettings) {
			this.updateCalls.push(nextSettings);
			settings = nextSettings;
		},
		async getAvailableTools() { return []; },
		async getAvailableToolsWithLazyStart() { return []; },
		async getToolsForModelContext() { return []; },
		async callTool() { return ''; },
		async callActualTool() { return ''; },
		async connectServer() {},
		async disconnectServer() {},
		async checkHealth() { return []; },
		getEnabledServerSummaries() { return []; },
		getAllStates() { return []; },
		getState() { return undefined; },
		async getToolsForServer() { return []; },
		onStateChange() { return () => {}; },
		async dispose() {
			this.disposed = true;
		},
	};
}

test('resolveMcpRuntimeSettings 会补齐默认值并复制数组字段', () => {
	const resolved = resolveMcpRuntimeSettings({
		builtinFetchEnabled: false,
		servers: [{
			id: 'server-1',
			name: 'Server 1',
			enabled: true,
			transportType: 'stdio',
			timeout: 30000,
		}],
		disabledBuiltinToolNames: ['tool-a'],
	});

	assert.equal(resolved.builtinFetchEnabled, false);
	assert.equal(resolved.maxToolCallLoops, DEFAULT_MCP_SETTINGS.maxToolCallLoops);
	assert.notEqual(resolved.servers, DEFAULT_MCP_SETTINGS.servers);
	assert.deepEqual(resolved.disabledBuiltinToolNames, ['tool-a']);
});

test('McpDomainService 首次 initialize 会创建运行时，再次 initialize 会更新 settings', async () => {
	const fakeManager = createFakeManager();
	let createCount = 0;
	const service = new McpDomainService({
		async create(settings) {
			createCount += 1;
			await fakeManager.updateSettings(settings);
			fakeManager.updateCalls = [];
			return fakeManager;
		},
	});

	await service.initialize({ servers: [] });
	await service.initialize({
		servers: [{
			id: 'server-2',
			name: 'Server 2',
			enabled: true,
			transportType: 'stdio',
			timeout: 30000,
		}],
	});

	assert.equal(createCount, 1);
	assert.equal(fakeManager.updateCalls.length, 1);
	assert.equal(fakeManager.updateCalls[0].servers[0]?.id, 'server-2');
	assert.equal(service.getManager(), fakeManager);
	await service.dispose();
	assert.equal(fakeManager.disposed, true);
});

test('McpDomainService 在创建失败后允许重试 initialize', async () => {
	let createCount = 0;
	const service = new McpDomainService({
		async create() {
			createCount += 1;
			if (createCount === 1) {
				throw new Error('boom');
			}
			return createFakeManager();
		},
	});

	await assert.rejects(async () => {
		await service.initialize({ servers: [] });
	});
	await service.initialize({ servers: [] });

	assert.equal(createCount, 2);
	assert.ok(service.getManager());
});

test('McpRuntimeCoordinator 会把 settings.aiRuntime.mcp 交给 service 初始化', async () => {
	let lastSettings: McpSettings | null = null;
	const coordinator = new McpRuntimeCoordinator({
		async create(settings) {
			lastSettings = settings;
			return createFakeManager();
		},
	});

	await coordinator.initialize({
		servers: [{
			id: 'server-3',
			name: 'Server 3',
			enabled: true,
			transportType: 'stdio',
			timeout: 30000,
		}],
	});

	assert.equal(lastSettings?.servers[0]?.id, 'server-3');
});

test('McpRuntimeManagerImpl 会在设置移除服务器时断开旧连接', async () => {
	const { logger } = createLogger();
	const disconnectCalls: string[] = [];
	const fakeProcessManager = {
		getAllStates() {
			return [{ serverId: 'server-1', status: 'running', tools: [] } satisfies McpServerState];
		},
		getState() {
			return undefined;
		},
		async ensureConnected() {
			throw new Error('should not connect');
		},
		async disconnect(serverId: string) {
			disconnectCalls.push(serverId);
		},
		async dispose() {},
	} as unknown as McpProcessManager;

	const manager = new McpRuntimeManagerImpl(
		{ enabled: false, servers: [createServerConfig()] },
		createRuntimeDependencies(logger),
		{
			createProcessManager() {
				return fakeProcessManager;
			},
			createHealthChecker() {
				return { async check() { return []; } } as unknown as McpHealthChecker;
			},
		},
	);

	await manager.updateSettings({ enabled: false, servers: [] });

	assert.deepEqual(disconnectCalls, ['server-1']);
	await manager.dispose();
	assert.equal(disconnectCalls.length, 1);
});

test('McpRuntimeManagerImpl 会把状态变化广播给监听器并隔离异常监听器', () => {
	const { entries, logger } = createLogger();
	let emitStates: ((states: McpServerState[]) => void) | null = null;
	const manager = new McpRuntimeManagerImpl(
		{ enabled: false, servers: [] },
		createRuntimeDependencies(logger),
		{
			createProcessManager(_dependencies, onStateChange) {
				emitStates = onStateChange;
				return {
					getAllStates() { return []; },
					getState() { return undefined; },
					async ensureConnected() { throw new Error('not used'); },
					async disconnect() {},
					async dispose() {},
				} as unknown as McpProcessManager;
			},
			createHealthChecker() {
				return { async check() { return []; } } as unknown as McpHealthChecker;
			},
		},
	);

	manager.onStateChange(() => {
		throw new Error('listener failed');
	});
	const seen: McpServerState[][] = [];
	const unsubscribe = manager.onStateChange((states) => {
		seen.push(states);
	});

	emitStates?.([{ serverId: 'server-1', status: 'running', tools: [] }]);
	unsubscribe();
	emitStates?.([{ serverId: 'server-1', status: 'error', tools: [], lastError: 'boom' }]);

	assert.equal(seen.length, 1);
	assert.equal(seen[0]?.[0]?.status, 'running');
	assert.ok(entries.some((entry) => entry.level === 'error' && entry.message.includes('状态监听器')));
});

test('McpRuntimeManagerImpl 的健康检查只透传启用的服务器', async () => {
	const { logger } = createLogger();
	let checkedServers: McpServerConfig[] = [];
	const manager = new McpRuntimeManagerImpl(
		{
			enabled: false,
			servers: [
				createServerConfig({ id: 'server-enabled', name: 'Enabled' }),
				createServerConfig({ id: 'server-disabled', name: 'Disabled', enabled: false }),
			],
		},
		createRuntimeDependencies(logger),
		{
			createProcessManager() {
				return {
					getAllStates() { return []; },
					getState() { return undefined; },
					async ensureConnected() { throw new Error('not used'); },
					async disconnect() {},
					async dispose() {},
				} as unknown as McpProcessManager;
			},
			createHealthChecker() {
				return {
					async check(servers: McpServerConfig[]) {
						checkedServers = servers;
						return [];
					},
				} as unknown as McpHealthChecker;
			},
		},
	);

	await manager.checkHealth();

	assert.deepEqual(checkedServers.map((server) => server.id), ['server-enabled']);
});

test('McpProcessManager 会复用运行中的客户端并同步状态与工具列表', async () => {
	const { logger } = createLogger();
	const snapshots: McpServerState[][] = [];
	let createCount = 0;
	let emitStatus: ((status: McpServerStatus, error?: string) => void) | null = null;
	let emitTools: ((tools: McpToolInfo[]) => void) | null = null;
	const client = {
		get currentStatus() { return 'running' as const; },
		get currentTools() { return [createTool()]; },
		get pid() { return 42; },
		async connect() {
			emitStatus?.('running');
			emitTools?.([createTool()]);
		},
		async disconnect() {},
	} as unknown as import('./runtime/protocol-client').McpProtocolClient;

	const manager = new McpProcessManager(
		createRuntimeDependencies(logger),
		(states) => {
			snapshots.push(states.map((state) => ({ ...state, tools: [...state.tools] })));
		},
		{
			createProtocolClient(_config, _dependencies, onStatusChange, onToolsChange) {
				createCount += 1;
				emitStatus = onStatusChange;
				emitTools = onToolsChange;
				return client;
			},
		},
	);

	const config = createServerConfig();
	const first = await manager.ensureConnected(config);
	const second = await manager.ensureConnected(config);

	assert.equal(first, second);
	assert.equal(createCount, 1);
	assert.equal(manager.getState(config.id)?.status, 'running');
	assert.equal(manager.getState(config.id)?.pid, 42);
	assert.equal(manager.getState(config.id)?.tools[0]?.name, 'search');
	assert.equal(snapshots[0]?.[0]?.status, 'connecting');
	assert.equal(snapshots.at(-1)?.[0]?.status, 'running');
});

test('McpProcessManager dispose 会断开全部客户端并清空状态', async () => {
	const { logger } = createLogger();
	let disconnectCount = 0;
	const client = {
		get currentStatus() { return 'running' as const; },
		get currentTools() { return []; },
		get pid() { return undefined; },
		async connect() {},
		async disconnect() {
			disconnectCount += 1;
		},
	} as unknown as import('./runtime/protocol-client').McpProtocolClient;

	const manager = new McpProcessManager(
		createRuntimeDependencies(logger),
		() => {},
		{
			createProtocolClient() {
				return client;
			},
		},
	);

	await manager.ensureConnected(createServerConfig());
	await manager.dispose();

	assert.equal(disconnectCount, 1);
	assert.equal(manager.getAllStates().length, 0);
	assert.equal(manager.getClient('server-1'), undefined);
	await assert.rejects(async () => {
		await manager.ensureConnected(createServerConfig({ id: 'server-2' }));
	}, /已销毁/);
});

test('McpHealthChecker 会返回成功与失败结果并记录日志', async () => {
	const successLogger = createLogger();
	const successChecker = new McpHealthChecker(
		{
			async ensureConnected() {
				return {
					get currentTools() { return [createTool('server-ok', 'lookup')]; },
				} as unknown as import('./runtime/protocol-client').McpProtocolClient;
			},
		} as unknown as McpProcessManager,
		successLogger.logger,
	);
	const successResult = await successChecker.checkOne(createServerConfig({ id: 'server-ok', name: 'Server OK' }));

	assert.equal(successResult.success, true);
	assert.equal(successResult.toolCount, 1);
	assert.ok(successLogger.entries.some((entry) => entry.level === 'info' && entry.message.includes('健康检测通过')));

	const failureLogger = createLogger();
	const failureChecker = new McpHealthChecker(
		{
			async ensureConnected() {
				throw new Error('timeout');
			},
		} as unknown as McpProcessManager,
		failureLogger.logger,
	);
	const failureResult = await failureChecker.checkOne(createServerConfig({ id: 'server-bad', name: 'Server Bad' }));

	assert.equal(failureResult.success, false);
	assert.equal(failureResult.error, 'timeout');
	assert.ok(failureLogger.entries.some((entry) => entry.level === 'error' && entry.message.includes('健康检测失败')));
});

test('protocol-client helpers 会分类重试错误并安全预览参数', () => {
	assert.equal(isBusinessLevelMcpError(new McpJsonRpcError('bad request', 400)), true);
	assert.equal(isBusinessLevelMcpError(new McpJsonRpcError('server error', 500)), false);
	assert.equal(isRetryableToolCallError(new Error('Service unavailable 503')), true);
	assert.equal(isRetryableToolCallError(new Error('validation failed 400')), false);
	assert.equal(shouldReconnectRemoteTransport(new Error('session reset'), 0), true);
	assert.equal(shouldReconnectRemoteTransport(new Error('session reset'), 1), false);

	const preview = previewProtocolClientArgs({ prompt: 'x'.repeat(400) });
	assert.ok(preview.endsWith('...'));
	assert.ok(preview.length <= 223);
});

test('createMcpTransport 会按 transportType 选择实现并校验必填配置', () => {
	const { logger } = createLogger();
	const dependencies = createRuntimeDependencies(logger);

	assert.ok(createMcpTransport(createServerConfig({ transportType: 'stdio' }), dependencies) instanceof StdioTransport);
	assert.ok(createMcpTransport(createServerConfig({ transportType: 'websocket', url: 'wss://example.com' }), dependencies) instanceof WebSocketTransport);
	assert.ok(createMcpTransport(createServerConfig({ transportType: 'http', url: 'https://example.com/mcp' }), dependencies) instanceof HttpTransport);
	assert.ok(createMcpTransport(createServerConfig({ transportType: 'remote-sse', url: 'https://example.com/sse' }), dependencies) instanceof RemoteSseTransport);
	assert.equal(isMcpRemoteTransport(createServerConfig({ transportType: 'http', url: 'https://example.com/mcp' })), true);
	assert.equal(isMcpRemoteTransport(createServerConfig({ transportType: 'stdio' })), false);

	assert.throws(() => {
		createMcpTransport(createServerConfig({ transportType: 'http', url: undefined }), dependencies);
	}, /HTTP URL/);
	assert.throws(() => {
		createMcpTransport(createServerConfig({ transportType: 'stdio', command: undefined }), dependencies);
	}, /启动命令/);
});