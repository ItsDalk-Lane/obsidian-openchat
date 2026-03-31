import assert from 'node:assert/strict';
import Module from 'node:module';
import test from 'node:test';
import { DEFAULT_CHAT_SETTINGS } from 'src/domains/chat/config';
import {
	createChatProviderMessageFacade,
} from './chat-provider-message-facade';
import { getChatMessageManagementSettings } from 'src/domains/chat/service-provider-message-support';
import type { ChatProviderMessageDeps } from './chat-provider-messages';
import type { ChatMessage, ChatSettings, ChatState, ChatSession } from '../types/chat';

const ensureWindowLocalStorage = (): void => {
	const globalScope = globalThis as typeof globalThis & {
		window?: { localStorage?: { getItem: (key: string) => string | null } }
	}
	globalScope.window = {
		...(globalScope.window ?? {}),
		localStorage: {
			getItem: () => 'en',
		},
	}
};

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

const createProviderMessageDeps = (
	settings: ChatSettings,
	pluginChatSettings: ChatSettings,
): ChatProviderMessageDeps => ({
	getActiveFilePath: () => null,
	state: {
		contextNotes: [],
		multiModelMode: 'single',
		selectedModelId: null,
	} satisfies Pick<ChatState, 'contextNotes' | 'multiModelMode' | 'selectedModelId'>,
	settings,
	pluginChatSettings,
	messageService: null as never,
	messageContextOptimizer: null as never,
	contextCompactionService: null as never,
	getDefaultProviderTag: () => null,
	resolveProviderByTag: () => null,
	findProviderByTagExact: () => null,
	resolveSkillsSystemPromptBlock: async () => undefined,
	persistSessionContextCompactionFrontmatter: async () => {},
});

test('createChatProviderMessageFacade 每次调用都读取最新 settings 快照', () => {
	let settings: ChatSettings = {
		...DEFAULT_CHAT_SETTINGS,
		messageManagement: {
			...DEFAULT_CHAT_SETTINGS.messageManagement,
			recentTurns: 2,
		},
	};
	let pluginChatSettings: ChatSettings = {
		...DEFAULT_CHAT_SETTINGS,
		messageManagement: {
			...DEFAULT_CHAT_SETTINGS.messageManagement,
			recentTurns: 4,
		},
	};
	let getterCalls = 0;

	const facade = createChatProviderMessageFacade(() => {
		getterCalls += 1;
		return createProviderMessageDeps(settings, pluginChatSettings);
	}, {
		buildProviderMessages: async () => [],
		buildProviderMessagesWithOptions: async () => [],
		buildProviderMessagesForAgent: async () => [],
		getMessageManagementSettings: getChatMessageManagementSettings,
		getDefaultFileContentOptions: () => ({
			maxFileSize: 1024 * 1024,
			maxContentLength: 10000,
			includeExtensions: [],
			excludeExtensions: [],
			excludePatterns: [],
		}),
		resolveContextBudget: () => ({
			contextLength: 1,
			reserveForOutput: 1,
			usableInputTokens: 1,
			triggerTokens: 1,
			targetTokens: 1,
			triggerRatio: 0.75,
			targetRatio: 0.45,
		}),
	});

	assert.equal(facade.getMessageManagementSettings().recentTurns, 4);

	settings = {
		...settings,
		messageManagement: {
			...settings.messageManagement,
			recentTurns: 3,
		},
	};
	pluginChatSettings = {
		...pluginChatSettings,
		messageManagement: {
			...pluginChatSettings.messageManagement,
			recentTurns: 6,
			summaryModelTag: 'claude',
		},
	};

	const refreshedSettings = facade.getMessageManagementSettings();
	assert.equal(refreshedSettings.recentTurns, 6);
	assert.equal(refreshedSettings.summaryModelTag, 'claude');
	assert.equal(getterCalls, 2);
});

test('buildProviderMessagesForAgent 忽略会话里遗留的模板系统提示词字段', async () => {
	ensureWindowLocalStorage();
	installObsidianStub();
	const { buildProviderMessagesForAgent } = await import('./chat-provider-messages');
	let capturedSystemPrompt: string | undefined;
	const deps = createProviderMessageDeps(DEFAULT_CHAT_SETTINGS, DEFAULT_CHAT_SETTINGS);
	deps.messageService = {
		createMessage: (role, content, extras) => ({
			id: 'message-ephemeral',
			role,
			content,
			timestamp: 1,
			images: [],
			isError: false,
			metadata: extras?.metadata ?? {},
			toolCalls: [],
		}),
		buildContextProviderMessage: async () => null,
		toProviderMessages: async (messages: ChatMessage[], options) => {
			capturedSystemPrompt = options?.systemPrompt;
			return messages.map((message) => ({
				role: message.role === 'assistant' ? 'assistant' : 'user',
				content: message.content,
			}));
		},
	} as never;
	deps.messageContextOptimizer = {
		estimateChatTokens: () => 1,
		optimize: async (messages: ChatMessage[]) => ({
			messages,
			historyTokenEstimate: 1,
			contextCompaction: null,
		}),
	} as never;
	deps.contextCompactionService = {
		compactContextProviderMessage: async () => ({
			message: null,
			summary: '',
			signature: '',
			tokenEstimate: 0,
		}),
	} as never;

	const userMessage: ChatMessage = {
		id: 'message-1',
		role: 'user',
		content: 'hello',
		timestamp: 1,
		images: [],
		isError: false,
		metadata: {},
		toolCalls: [],
	};
	const session: ChatSession = {
		id: 'session-1',
		title: 'Chat',
		modelId: 'model-a',
		messages: [userMessage],
		createdAt: 1,
		updatedAt: 1,
		livePlan: null,
		contextCompaction: null,
		requestTokenState: null,
	};

	const providerMessages = await buildProviderMessagesForAgent(
		deps,
		[userMessage],
		session,
	)

	assert.equal(capturedSystemPrompt, undefined)
	assert.deepEqual(providerMessages, [{ role: 'user', content: 'hello' }])
})
