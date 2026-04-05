import assert from 'node:assert/strict';
import Module from 'node:module';
import test from 'node:test';
import {
	PromptBuilder,
	type PromptBuilderContextMessageParams,
} from 'src/core/services/PromptBuilder';
import { DEFAULT_CHAT_SETTINGS } from 'src/domains/chat/config';
import {
	DISCOVER_SKILLS_TOOL_NAME,
	INVOKE_SKILL_TOOL_NAME,
} from 'src/tools/skill/skill-tools';
import {
	createChatProviderMessageFacade,
} from './chat-provider-message-facade';
import {
	buildSelectedTextSourceLabel,
	buildSelectionContextPromptBlock,
} from './chat-selection-context-prompt';
import { getChatMessageManagementSettings } from 'src/domains/chat/service-provider-message-support';
import type { ChatProviderMessageDeps } from './chat-provider-messages';
import type { ChatMessage, ChatSettings, ChatState, ChatSession } from '../types/chat';

const ensureWindowLocalStorage = (): void => {
	const globalScope = globalThis as typeof globalThis & {
		window?: Window & typeof globalThis
	}
	const localStorage: Storage = {
		length: 0,
		clear: () => {},
		getItem: () => 'en',
		key: () => null,
		removeItem: () => {},
		setItem: () => {},
	}
	globalScope.window = {
		...(globalScope.window ?? ({} as Window & typeof globalThis)),
		localStorage,
	} as Window & typeof globalThis
};

type MessageStubExtras = {
	images?: string[];
	isError?: boolean;
	metadata?: Record<string, unknown>;
	toolCalls?: unknown[];
};

const createEphemeralMessage = (
	role: ChatMessage['role'],
	content: string,
	extras?: MessageStubExtras,
): ChatMessage => ({
	id: 'message-ephemeral',
	role,
	content,
	timestamp: 1,
	images: extras?.images ?? [],
	isError: extras?.isError ?? false,
	metadata: extras?.metadata ?? {},
	toolCalls: (extras?.toolCalls ?? []) as never[],
});

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
		createMessage: createEphemeralMessage,
		buildContextProviderMessage: async () => null,
		toProviderMessages: async (
			messages: ChatMessage[],
			options?: { systemPrompt?: string },
		) => {
			if (options?.systemPrompt) {
				capturedSystemPrompt = options.systemPrompt;
			}
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

test('buildSelectedTextSourceLabel 会把文件与行范围绑定到 selected_text 源标签', () => {
	assert.equal(buildSelectedTextSourceLabel({
		filePath: 'docs/spec.md',
		range: { from: 10, to: 30, startLine: 12, endLine: 24 },
	}), 'selected_text @ docs/spec.md#L12-L24');
	assert.equal(buildSelectedTextSourceLabel({
		filePath: 'docs/spec.md',
	}), 'selected_text @ docs/spec.md');
});

test('PromptBuilder 会把 selected_text 源标签写入上下文 XML', async () => {
	const promptBuilder = new PromptBuilder({
		getActiveFilePath: () => null,
	});
	const contextMessage = await promptBuilder.buildChatContextMessage({
		selectedFiles: [],
		selectedFolders: [],
		contextNotes: [],
		selectedText: 'const value = 1;',
		selectedTextSource: 'selected_text @ src/example.ts#L3',
		sourcePath: '',
	});

	assert.ok(contextMessage);
	assert.match(contextMessage?.content ?? '', /<source>selected_text @ src\/example.ts#L3<\/source>/);
	assert.match(contextMessage?.content ?? '', /const value = 1;/);
});

test('buildProviderMessagesForAgent 会把选区文件与范围注入 provider prompt 和 context source', async () => {
	ensureWindowLocalStorage();
	installObsidianStub();
	const { buildProviderMessagesForAgent } = await import('./chat-provider-messages');
	let capturedSystemPrompt: string | undefined;
	let capturedSelectedTextSource: string | null | undefined;
	const deps = createProviderMessageDeps(DEFAULT_CHAT_SETTINGS, DEFAULT_CHAT_SETTINGS);
	deps.messageService = {
		createMessage: createEphemeralMessage,
		buildContextProviderMessage: async (params: PromptBuilderContextMessageParams) => {
			capturedSelectedTextSource = params.selectedTextSource;
			return {
				role: 'user',
				content: '<documents />',
			};
		},
		toProviderMessages: async (
			messages: ChatMessage[],
			options?: { systemPrompt?: string },
		) => {
			if (options?.systemPrompt) {
				capturedSystemPrompt = options.systemPrompt;
			}
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
		id: 'message-2',
		role: 'user',
		content: '请修改这段实现',
		timestamp: 1,
		images: [],
		isError: false,
		metadata: {
			selectedText: 'const value = 1;',
			selectedTextContext: {
				filePath: 'src/example.ts',
				range: { from: 5, to: 20, startLine: 3, endLine: 6 },
			},
		},
		toolCalls: [],
	};
	const session: ChatSession = {
		id: 'session-2',
		title: 'Chat',
		modelId: 'model-a',
		messages: [userMessage],
		createdAt: 1,
		updatedAt: 1,
		livePlan: null,
		contextCompaction: null,
		requestTokenState: null,
	};

	await buildProviderMessagesForAgent(
		deps,
		[userMessage],
		session,
	);

	assert.equal(capturedSelectedTextSource, 'selected_text @ src/example.ts#L3-L6');
	assert.match(capturedSystemPrompt ?? '', /<selection-context>/);
	assert.match(capturedSystemPrompt ?? '', /selected_text_file=src\/example.ts/);
	assert.match(capturedSystemPrompt ?? '', /selected_text_lines=3-6/);
	assert.match(capturedSystemPrompt ?? '', /edit_file_strategy=/);
});

test('buildProviderMessagesWithOptions 只向 skills resolver 传入当前请求的相关上下文', async () => {
	ensureWindowLocalStorage();
	installObsidianStub();
	const { buildProviderMessagesWithOptions } = await import('./chat-provider-messages');
	let capturedSkillsInput:
		| { requestTools: { name: string }[]; relevanceQuery?: string; limit?: number }
		| undefined;
	const deps = createProviderMessageDeps(DEFAULT_CHAT_SETTINGS, DEFAULT_CHAT_SETTINGS);
	deps.messageService = {
		createMessage: createEphemeralMessage,
		buildContextProviderMessage: async () => null,
		toProviderMessages: async (
			messages: ChatMessage[],
			options?: { systemPrompt?: string },
		) => {
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
	deps.resolveSkillsSystemPromptBlock = async (input) => {
		capturedSkillsInput = {
			requestTools: input.requestTools.map((tool) => ({ name: tool.name })),
			relevanceQuery: input.relevanceQuery,
			limit: input.limit,
		};
		return '<skills>\n  <skill><name>pdf</name></skill>\n</skills>';
	};

	const userMessage: ChatMessage = {
		id: 'message-3',
		role: 'user',
		content: '请把季度报告整理为 PDF。',
		timestamp: 1,
		images: [],
		isError: false,
		metadata: {
			selectedText: 'Quarterly report draft',
			selectedTextContext: {
				filePath: 'docs/report.md',
				range: { from: 1, to: 24, startLine: 1, endLine: 3 },
			},
		},
		toolCalls: [],
	};
	const session: ChatSession = {
		id: 'session-3',
		title: 'Chat',
		modelId: 'model-a',
		messages: [userMessage],
		createdAt: 1,
		updatedAt: 1,
		livePlan: null,
		contextCompaction: null,
		requestTokenState: null,
	};

	await buildProviderMessagesWithOptions(deps, session, {
		taskDescription: '生成 PDF 版本并保持结构清晰',
		requestTools: [{ name: DISCOVER_SKILLS_TOOL_NAME } as never],
	});

	assert.deepEqual(capturedSkillsInput?.requestTools, [{ name: DISCOVER_SKILLS_TOOL_NAME }]);
	assert.match(capturedSkillsInput?.relevanceQuery ?? '', /当前任务：生成 PDF 版本并保持结构清晰/);
	assert.ok((capturedSkillsInput?.relevanceQuery?.length ?? 0) > 0);
});

test('buildProviderMessagesWithOptions 在没有 skill 工具时不会注入 skills block', async () => {
	ensureWindowLocalStorage();
	installObsidianStub();
	const { buildProviderMessagesWithOptions } = await import('./chat-provider-messages');
	let capturedSystemPrompt: string | undefined;
	const deps = createProviderMessageDeps(DEFAULT_CHAT_SETTINGS, DEFAULT_CHAT_SETTINGS);
	deps.messageService = {
		createMessage: createEphemeralMessage,
		buildContextProviderMessage: async () => null,
		toProviderMessages: async (
			messages: ChatMessage[],
			options?: { systemPrompt?: string },
		) => {
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
	deps.resolveSkillsSystemPromptBlock = async () => undefined;

	const userMessage: ChatMessage = {
		id: 'message-4',
		role: 'user',
		content: '请修改这段实现',
		timestamp: 1,
		images: [],
		isError: false,
		metadata: {},
		toolCalls: [],
	};
	const session: ChatSession = {
		id: 'session-4',
		title: 'Chat',
		modelId: 'model-a',
		messages: [userMessage],
		createdAt: 1,
		updatedAt: 1,
		livePlan: null,
		contextCompaction: null,
		requestTokenState: null,
	};

	await buildProviderMessagesWithOptions(deps, session, {
		requestTools: [],
	});

	assert.doesNotMatch(capturedSystemPrompt ?? '', /<skills>/);
});

test('buildProviderMessagesWithOptions 在只有 invoke_skill 时也会注入 skills block', async () => {
	ensureWindowLocalStorage();
	installObsidianStub();
	const { buildProviderMessagesWithOptions } = await import('./chat-provider-messages');
	let capturedSkillsInput:
		| { requestTools: { name: string }[]; relevanceQuery?: string; limit?: number }
		| undefined;
	const deps = createProviderMessageDeps(DEFAULT_CHAT_SETTINGS, DEFAULT_CHAT_SETTINGS);
	deps.messageService = {
		createMessage: createEphemeralMessage,
		buildContextProviderMessage: async () => null,
		toProviderMessages: async (messages: ChatMessage[]) => {
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
	deps.resolveSkillsSystemPromptBlock = async (input) => {
		capturedSkillsInput = {
			requestTools: input.requestTools.map((tool) => ({ name: tool.name })),
			relevanceQuery: input.relevanceQuery,
			limit: input.limit,
		};
		return '<skills>\n  <skill><name>pdf</name></skill>\n</skills>';
	};

	const userMessage: ChatMessage = {
		id: 'message-5',
		role: 'user',
		content: '直接帮我执行 pdf skill。',
		timestamp: 1,
		images: [],
		isError: false,
		metadata: {},
		toolCalls: [],
	};
	const session: ChatSession = {
		id: 'session-5',
		title: 'Chat',
		modelId: 'model-a',
		messages: [userMessage],
		createdAt: 1,
		updatedAt: 1,
		livePlan: null,
		contextCompaction: null,
		requestTokenState: null,
	};

	await buildProviderMessagesWithOptions(deps, session, {
		taskDescription: '执行 pdf skill 并返回结果',
		requestTools: [{ name: INVOKE_SKILL_TOOL_NAME } as never],
	});

	assert.deepEqual(capturedSkillsInput?.requestTools, [{ name: INVOKE_SKILL_TOOL_NAME }]);
	assert.match(capturedSkillsInput?.relevanceQuery ?? '', /执行 pdf skill 并返回结果/);
	assert.ok((capturedSkillsInput?.relevanceQuery?.length ?? 0) > 0);
});

test('buildSelectionContextPromptBlock 在缺少行范围时仍会保留文件锚点', () => {
	const block = buildSelectionContextPromptBlock({
		selectedText: 'const value = 1;',
		selectedTextContext: {
			filePath: 'src/example.ts',
			range: { from: 5, to: 20 },
		},
	});

	assert.match(block ?? '', /selected_text_file=src\/example.ts/);
	assert.doesNotMatch(block ?? '', /selected_text_lines=/);
	assert.match(block ?? '', /default_local_strategy=/);
});
