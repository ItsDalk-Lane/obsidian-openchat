import assert from 'node:assert/strict';
import Module from 'node:module';
import test from 'node:test';
import type { ToolExecutor } from 'src/core/agents/loop/types';
import type { BaseOptions, Message, ProviderSettings, Vendor } from 'src/types/provider';
import type { ToolDefinition, ToolExecutionRecord } from 'src/types/tool';
import {
	attachToolSurfaceMetadata,
	buildDiscoveryCatalog,
	compileExecutableToolDefinition,
} from './chat-tool-discovery-catalog';
import type { ChatGenerationDeps } from './chat-generation';
import { resolveToolSurfaceSettings } from './chat-tool-feature-flags';
import { createProviderToolSurfaceAdapter } from './chat-tool-surface-adapter';
import type { PreparedToolTurn } from './chat-tool-selection-types';
import type { ChatMessage, ChatSession, ChatState } from '../types/chat';

const PROVIDER_NAMES = ['OpenAI', 'Claude', 'OpenRouter'] as const;

const installObsidianStub = (): void => {
	const globalScope = globalThis as typeof globalThis & {
		__obsidianStubInstalled?: boolean;
	};
	if (globalScope.__obsidianStubInstalled) {
		return;
	}
	const moduleLoader = Module as typeof Module & {
		_load: (request: string, parent: object | null, isMain: boolean) => unknown;
	};
	const originalLoad = moduleLoader._load;
	moduleLoader._load = (request, parent, isMain) => {
		if (request === 'obsidian') {
			return {};
		}
		return originalLoad(request, parent, isMain);
	};
	globalScope.__obsidianStubInstalled = true;
};

const loadRuntimeModules = async (): Promise<{
	availableVendors: Vendor[];
	generateAssistantResponseForModelImpl: typeof import('./chat-generation-for-model').generateAssistantResponseForModelImpl;
}> => {
	installObsidianStub();
	const [{ availableVendors }, { generateAssistantResponseForModelImpl }] = await Promise.all([
		import('src/domains/settings/config-ai-runtime-vendors'),
		import('./chat-generation-for-model'),
	]);
	return {
		availableVendors,
		generateAssistantResponseForModelImpl,
	};
};

function createSession(content = '请读取 README.md 并总结内容'): ChatSession {
	return {
		id: 'session-main-chain',
		title: 'Main Chain',
		modelId: 'model-a',
		messages: [{
			id: 'message-user',
			role: 'user',
			content,
			timestamp: 1,
			images: [],
			isError: false,
			metadata: {},
			toolCalls: [],
		}],
		createdAt: 1,
		updatedAt: 1,
		livePlan: null,
		contextCompaction: null,
		requestTokenState: null,
		contextNotes: [],
		selectedImages: [],
		selectedFiles: [],
		selectedFolders: [],
	};
}

function createProvider(vendor: string): ProviderSettings {
	return {
		tag: `provider-${vendor}`,
		vendor,
		options: {
			apiKey: 'test-key',
			baseURL: 'https://example.com',
			model: 'test-model',
			parameters: {},
		},
	};
}

function createMessage(role: ChatMessage['role'], content: string, extras?: Partial<ChatMessage>): ChatMessage {
	return {
		id: `message-${role}-${Math.random().toString(16).slice(2)}`,
		role,
		content,
		timestamp: 1,
		images: [],
		isError: false,
		metadata: extras?.metadata ?? {},
		toolCalls: extras?.toolCalls ?? [],
		...extras,
	};
}

function createTool(name: string, source: ToolDefinition['source'] = 'builtin', sourceId = 'builtin'): ToolDefinition {
	return compileExecutableToolDefinition(attachToolSurfaceMetadata({
		name,
		description: `${name} description`,
		inputSchema: {
			type: 'object',
			properties: {
				value: { type: 'string' },
			},
			required: ['value'],
		},
		source,
		sourceId,
	}));
}

function createPreparedToolTurn(
	tools: readonly ToolDefinition[],
	options?: {
		toolExecutor?: ToolExecutor;
		getTools?: () => Promise<ToolDefinition[]>;
		maxToolCallLoops?: number;
		candidateServerIds?: string[];
		mode?: PreparedToolTurn['mode'];
	},
): PreparedToolTurn {
	const candidateScope = {
		mode: options?.mode ?? 'atomic-tools',
		candidateToolNames: tools.map((tool) => tool.name),
		candidateServerIds: options?.candidateServerIds ?? [],
		reasons: ['test'],
		query: 'test-query',
	};
	const adapter = createProviderToolSurfaceAdapter(resolveToolSurfaceSettings({
		toolSurface: { nativeDeferredAdapter: false },
	}));
	const discoveryCatalog = buildDiscoveryCatalog({
		tools: [...tools],
		serverEntries: (options?.candidateServerIds ?? []).map((serverId) => ({
			id: serverId,
			name: serverId,
			description: `${serverId} server`,
			capabilityTags: [serverId],
		})),
	});
	const toolRuntime = {
		requestTools: [...tools],
		toolExecutor: options?.toolExecutor,
		getTools: options?.getTools,
		maxToolCallLoops: options?.maxToolCallLoops,
	};
	const providerDiscoveryPayload = adapter.buildDiscoveryPayload({
		catalog: discoveryCatalog,
		scope: candidateScope,
	});
	const providerExecutablePayload = adapter.buildExecutablePayload({
		scope: candidateScope,
		toolRuntime,
	});
	return {
		candidateScope,
		executableToolSet: providerExecutablePayload.toolSet,
		toolPolicies: { byToolName: {} },
		mode: candidateScope.mode,
		discoveryCatalog,
		providerDiscoveryPayload,
		providerExecutablePayload,
	};
}

function createDeps(provider: ProviderSettings, hooks?: {
	prepareToolTurn?: ChatGenerationDeps['prepareToolTurn'];
	buildProviderMessagesWithOptions?: ChatGenerationDeps['buildProviderMessagesWithOptions'];
	showMcpNoticeOnce?: (message: string) => void;
}): ChatGenerationDeps {
	let controller: AbortController | null = null;
	const state = {
		multiModelMode: 'single',
		isGenerating: false,
		error: undefined,
		enableReasoningToggle: false,
		enableWebSearchToggle: false,
		shouldSaveHistory: false,
	} as ChatState;
	return {
		state,
		messageService: {
			createMessage,
		} as never,
		imageResolver: {
			base64ToArrayBuffer: async () => new ArrayBuffer(0),
		} as never,
		sessionManager: null as never,
		ollamaCapabilityCache: new Map(),
		notify: () => {},
		getAvailableAttachmentPath: async (filename) => filename,
		writeVaultBinary: async () => {},
		getDefaultProviderTag: () => provider.tag,
		findProviderByTagExact: (tag?: string) => tag === provider.tag ? provider : null,
		getModelDisplayName: () => provider.options.model,
		createSubAgentStateUpdater: () => () => {},
		prepareToolTurn: hooks?.prepareToolTurn ?? (async () => createPreparedToolTurn([])),
		resolveToolRuntime: async () => ({ requestTools: [] }),
		buildProviderMessagesWithOptions: hooks?.buildProviderMessagesWithOptions
			?? (async (_session, options) => [{
				role: 'user',
				content: String(options?.requestTools?.length ?? 0),
			}]),
		normalizeToolExecutionRecord: (record) => record,
		showMcpNoticeOnce: hooks?.showMcpNoticeOnce ?? (() => {}),
		getOllamaCapabilities: async () => ({ reasoning: false }),
		normalizeOllamaBaseUrl: (baseURL = '') => baseURL,
		providerSupportsImageGeneration: () => false,
		rethrowImageGenerationError: (error) => { throw error; },
		saveActiveSession: async () => {},
		emitState: () => {},
		getController: () => controller,
		setController: (nextController) => {
			controller = nextController;
		},
	};
}

async function withPatchedVendor<T>(
	vendorName: typeof PROVIDER_NAMES[number],
	callback: (captures: {
		getProviderOptions: () => BaseOptions | undefined;
		getMessages: () => readonly Message[] | undefined;
	}) => Promise<T>,
): Promise<T> {
	const { availableVendors } = await loadRuntimeModules();
	const vendor = availableVendors.find((item) => item.name === vendorName) as Vendor | undefined;
	assert.ok(vendor, `未找到 vendor ${vendorName}`);
	const originalSendRequestFunc = vendor.sendRequestFunc;
	let capturedProviderOptions: BaseOptions | undefined;
	let capturedMessages: readonly Message[] | undefined;
	vendor.sendRequestFunc = ((options: BaseOptions) => {
		capturedProviderOptions = options;
		return async function* (messages: readonly Message[]) {
			capturedMessages = messages;
			yield `${vendorName} response`;
		};
	}) as Vendor['sendRequestFunc'];
	try {
		return await callback({
			getProviderOptions: () => capturedProviderOptions,
			getMessages: () => capturedMessages,
		});
	} finally {
		vendor.sendRequestFunc = originalSendRequestFunc;
	}
}

test('generateAssistantResponseForModelImpl 会把 prepared tool turn 注入主链 provider 请求', { concurrency: false }, async (t) => {
	const { generateAssistantResponseForModelImpl } = await loadRuntimeModules();
	for (const vendorName of PROVIDER_NAMES) {
		await t.test(`${vendorName} 路径保持同一注入契约`, async () => {
			const provider = createProvider(vendorName);
			const toolExecutor: ToolExecutor = {
				execute: async (call) => ({
					toolCallId: call.id,
					name: call.name,
					content: 'done',
				}),
			};
			const tools = [
				createTool('read_file'),
				createTool('github_search', 'mcp', 'github'),
			];
			const getTools = async () => [...tools];
			const preparedToolTurn = createPreparedToolTurn(tools, {
				toolExecutor,
				getTools,
				maxToolCallLoops: 7,
				candidateServerIds: ['github'],
			});
			const prepareCalls: Array<{ includeSubAgents?: boolean; parentSessionId?: string }> = [];
			const buildMessageRequests: ToolDefinition[][] = [];
			const buildDiscoveryPayloads: Array<PreparedToolTurn['providerDiscoveryPayload'] | undefined> = [];
			const buildExecutablePayloads: Array<PreparedToolTurn['providerExecutablePayload'] | undefined> = [];
			const callbackRecords: ToolExecutionRecord[] = [];
			const session = createSession();

			await withPatchedVendor(vendorName, async ({ getMessages, getProviderOptions }) => {
				const deps = createDeps(provider, {
					prepareToolTurn: async (input) => {
						prepareCalls.push({
							includeSubAgents: input.includeSubAgents,
							parentSessionId: input.parentSessionId,
						});
						return preparedToolTurn;
					},
					buildProviderMessagesWithOptions: async (_session, options) => {
						buildMessageRequests.push([...(options?.requestTools ?? [])]);
						buildDiscoveryPayloads.push(options?.providerDiscoveryPayload);
						buildExecutablePayloads.push(options?.providerExecutablePayload);
						return [{ role: 'user', content: 'hello' }];
					},
				});
				const message = await generateAssistantResponseForModelImpl(deps, session, provider.tag, {
					createMessageInSession: true,
					manageGeneratingState: true,
					onToolCallRecord: (record) => {
						callbackRecords.push(record);
					},
				});
				const providerOptions = getProviderOptions();
				assert.ok(providerOptions);
				assert.deepEqual(providerOptions.tools?.map((tool) => tool.name), ['read_file', 'github_search']);
				assert.equal(providerOptions.getTools, preparedToolTurn.executableToolSet.getTools);
				assert.equal(providerOptions.toolExecutor, toolExecutor);
				assert.equal(providerOptions.maxToolCallLoops, 7);
				providerOptions.onToolCallResult?.({
					id: 'record-1',
					name: 'read_file',
					arguments: { file_path: 'README.md' },
					result: 'ok',
					status: 'completed',
					timestamp: 1,
				});
				assert.equal(message.content, `${vendorName} response`);
				assert.equal(session.messages.at(-1)?.role, 'assistant');
				assert.equal(message.toolCalls?.length, 1);
				assert.equal(callbackRecords.length, 1);
				assert.deepEqual(buildMessageRequests[0]?.map((tool) => tool.name), ['read_file', 'github_search']);
				assert.equal(buildDiscoveryPayloads[0], preparedToolTurn.providerDiscoveryPayload);
				assert.equal(buildExecutablePayloads[0], preparedToolTurn.providerExecutablePayload);
				assert.equal(prepareCalls.length, 1);
				assert.equal(prepareCalls[0]?.includeSubAgents, true);
				assert.equal(prepareCalls[0]?.parentSessionId, session.id);
				assert.deepEqual(getMessages(), [{ role: 'user', content: 'hello' }]);
			});
		});
	}
});

test('generateAssistantResponseForModelImpl 在 prepareToolTurn 失败时会回退为空工具集继续请求', { concurrency: false }, async () => {
	const { generateAssistantResponseForModelImpl } = await loadRuntimeModules();
	const provider = createProvider('OpenAI');
	const notices: string[] = [];
	const buildMessageRequests: ToolDefinition[][] = [];
	const buildDiscoveryPayloads: Array<PreparedToolTurn['providerDiscoveryPayload'] | undefined> = [];
	const session = createSession();

	await withPatchedVendor('OpenAI', async ({ getProviderOptions }) => {
		const deps = createDeps(provider, {
			prepareToolTurn: async () => {
				throw new Error('boom');
			},
			buildProviderMessagesWithOptions: async (_session, options) => {
				buildMessageRequests.push([...(options?.requestTools ?? [])]);
				buildDiscoveryPayloads.push(options?.providerDiscoveryPayload);
				return [{ role: 'user', content: 'fallback' }];
			},
			showMcpNoticeOnce: (message) => {
				notices.push(message);
			},
		});
		const message = await generateAssistantResponseForModelImpl(deps, session, provider.tag);
		const providerOptions = getProviderOptions();
		assert.ok(providerOptions);
		assert.equal(providerOptions.tools, undefined);
		assert.deepEqual(buildMessageRequests[0], []);
		assert.equal(buildDiscoveryPayloads[0], undefined);
		assert.equal(message.content, 'OpenAI response');
	});

	assert.deepEqual(notices, ['MCP 工具初始化失败: boom']);
});

test('generateAssistantResponseForModelImpl 在提供 override 时跳过 prepareToolTurn 并使用 override 工具集', { concurrency: false }, async () => {
	const { generateAssistantResponseForModelImpl } = await loadRuntimeModules();
	const provider = createProvider('Claude');
	const overrideTool = createTool('override_tool');
	const toolExecutor: ToolExecutor = {
		execute: async (call) => ({
			toolCallId: call.id,
			name: call.name,
			content: 'override',
		}),
	};
	let prepareCalled = 0;
	const overrideGetTools = async () => [overrideTool];
	const buildMessageRequests: ToolDefinition[][] = [];
	const buildDiscoveryPayloads: Array<PreparedToolTurn['providerDiscoveryPayload'] | undefined> = [];

	await withPatchedVendor('Claude', async ({ getProviderOptions }) => {
		const deps = createDeps(provider, {
			prepareToolTurn: async () => {
				prepareCalled += 1;
				return createPreparedToolTurn([]);
			},
			buildProviderMessagesWithOptions: async (_session, options) => {
				buildMessageRequests.push([...(options?.requestTools ?? [])]);
				buildDiscoveryPayloads.push(options?.providerDiscoveryPayload);
				return [{ role: 'user', content: 'override' }];
			},
		});
		const message = await generateAssistantResponseForModelImpl(
			deps,
			createSession(),
			provider.tag,
			{
				toolRuntimeOverride: {
					requestTools: [overrideTool],
					getTools: overrideGetTools,
					toolExecutor,
					maxToolCallLoops: 3,
				},
			},
		);
		const providerOptions = getProviderOptions();
		assert.ok(providerOptions);
		assert.deepEqual(providerOptions.tools?.map((tool) => tool.name), ['override_tool']);
		assert.equal(providerOptions.getTools, overrideGetTools);
		assert.equal(providerOptions.toolExecutor, toolExecutor);
		assert.equal(providerOptions.maxToolCallLoops, 3);
		assert.deepEqual(buildMessageRequests[0]?.map((tool) => tool.name), ['override_tool']);
		assert.equal(buildDiscoveryPayloads[0], undefined);
		assert.equal(message.content, 'Claude response');
	});

	assert.equal(prepareCalled, 0);
});