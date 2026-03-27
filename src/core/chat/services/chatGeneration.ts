import { Notice, type App } from 'obsidian';
import type {
	BaseOptions,
	Message as ProviderMessage,
	ProviderSettings,
	ResolveEmbedAsBinary,
	SaveAttachment,
} from 'src/types/provider';
import type { ToolDefinition, ToolExecutionRecord } from 'src/types/tool';
import { availableVendors } from 'src/settings/ai-runtime';
import { t } from 'src/i18n/ai-runtime/helper';
import { localInstance } from 'src/i18n/locals';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { ResolvedToolRuntime, SubAgentStateCallback } from 'src/tools/sub-agents';
import type { GenerateAssistantOptions } from './ChatServiceCore';
import type { ChatImageResolver } from './ChatImageResolver';
import type { ChatSessionManager } from './ChatSessionManager';
import type { MessageService } from './MessageService';
import type { OllamaCapabilityCacheEntry } from './chatProviderHelpers';
import type { ChatMessage, ChatSession, ChatState } from '../types/chat';

interface ChatGenerationDeps {
	app: App;
	state: ChatState;
	messageService: MessageService;
	imageResolver: ChatImageResolver;
	sessionManager: ChatSessionManager;
	ollamaCapabilityCache: Map<string, OllamaCapabilityCacheEntry>;
	getDefaultProviderTag: () => string | null;
	findProviderByTagExact: (tag?: string) => ProviderSettings | null;
	getModelDisplayName: (provider: ProviderSettings) => string;
	createSubAgentStateUpdater: (
		assistantMessage: ChatMessage,
		session: ChatSession,
		shouldAttachToSession: boolean
	) => SubAgentStateCallback;
	resolveToolRuntime: (options?: {
		includeSubAgents?: boolean;
		parentSessionId?: string;
		subAgentStateCallback?: SubAgentStateCallback;
		session?: ChatSession;
	}) => Promise<ResolvedToolRuntime>;
	buildProviderMessagesWithOptions: (
		session: ChatSession,
		options?: {
			context?: string;
			taskDescription?: string;
			systemPrompt?: string;
			modelTag?: string;
			requestTools?: ToolDefinition[];
		}
	) => Promise<ProviderMessage[]>;
	normalizeToolExecutionRecord: (
		record: ToolExecutionRecord
	) => ToolExecutionRecord;
	showMcpNoticeOnce: (message: string) => void;
	getOllamaCapabilities: (
		baseURL: string,
		model: string
	) => Promise<OllamaCapabilityCacheEntry>;
	normalizeOllamaBaseUrl: (baseURL?: string) => string;
	providerSupportsImageGeneration: (provider: ProviderSettings) => boolean;
	rethrowImageGenerationError: (error: unknown) => never;
	saveActiveSession: () => Promise<void>;
	emitState: () => void;
	getController: () => AbortController | null;
	setController: (controller: AbortController | null) => void;
}

const updateAssistantToolCallRecord = (
	deps: ChatGenerationDeps,
	assistantMessage: ChatMessage,
	session: ChatSession,
	record: ToolExecutionRecord,
	shouldAttachToSession: boolean,
	onToolCallRecord?: (record: ToolExecutionRecord) => void
): void => {
	const normalizedRecord = deps.normalizeToolExecutionRecord(record);
	const existingToolCalls = assistantMessage.toolCalls ?? [];
	const existingIndex = existingToolCalls.findIndex((item) => item.id === normalizedRecord.id);
	if (existingIndex >= 0) {
		existingToolCalls[existingIndex] = normalizedRecord;
		assistantMessage.toolCalls = [...existingToolCalls];
	} else {
		assistantMessage.toolCalls = [
			...existingToolCalls,
			normalizedRecord,
		];
	}
	onToolCallRecord?.(normalizedRecord);
	session.updatedAt = Date.now();
	if (shouldAttachToSession) {
		deps.emitState();
	}
};

const createResolveEmbed = (imageResolver: ChatImageResolver): ResolveEmbedAsBinary => {
	return async (embed) => {
		const embedRecord = embed as unknown as Record<symbol, unknown> | null;
		const rawBase64Data = embedRecord?.[Symbol.for('originalBase64')];
		const base64Data = typeof rawBase64Data === 'string' ? rawBase64Data : undefined;
		if (base64Data) {
			return imageResolver.base64ToArrayBuffer(base64Data);
		}
		return new ArrayBuffer(0);
	};
};

const createSaveAttachment = (app: App): SaveAttachment => {
	return async (filename: string, data: ArrayBuffer): Promise<void> => {
		const attachmentPath = await app.fileManager.getAvailablePathForAttachment(filename);
		await app.vault.createBinary(attachmentPath, data);
	};
};

export const handleAssistantGenerationError = (
	deps: Pick<ChatGenerationDeps, 'state' | 'emitState' | 'setController'>,
	session: ChatSession,
	error: unknown
): void => {
	DebugLogger.error('[Chat][ChatService] generateAssistantResponse error', error);
	deps.state.isGenerating = false;
	deps.setController(null);

	const errorMessage = t('Generation failed. Please try again later.');

	deps.state.error = errorMessage;
	if (session.messages.length > 0) {
		const last = session.messages[session.messages.length - 1];
		if (last.role === 'assistant') {
			last.isError = true;
			if (!last.content) {
				last.content = errorMessage;
			}
		}
	}
	deps.emitState();
	new Notice(errorMessage, 10000);
};

export const generateAssistantResponse = async (
	deps: ChatGenerationDeps,
	session: ChatSession
): Promise<void> => {
	const modelTag = deps.state.selectedModelId ?? deps.getDefaultProviderTag();
	if (!modelTag) {
		new Notice(localInstance.no_ai_model_configured);
		return;
	}

	try {
		const assistantMessage = await generateAssistantResponseForModel(
			deps,
			session,
			modelTag,
			{
				createMessageInSession: true,
				manageGeneratingState: true,
			}
		);

		if (deps.state.shouldSaveHistory && session.filePath) {
			try {
				await deps.sessionManager.appendMessageToFile(session.filePath, assistantMessage);
			} catch (error) {
				DebugLogger.error('[ChatService] 追加AI回复失败', error);
			}
		} else if (deps.state.shouldSaveHistory) {
			DebugLogger.warn('[ChatService] 会话没有文件路径，回退到完整保存');
			try {
				await deps.saveActiveSession();
			} catch (error) {
				DebugLogger.error('[ChatService] 保存AI回复失败', error);
			}
		}
	} catch (error) {
		handleAssistantGenerationError(deps, session, error);
	}
};

export const generateAssistantResponseForModel = async (
	deps: ChatGenerationDeps,
	session: ChatSession,
	modelTag: string,
	options?: GenerateAssistantOptions
): Promise<ChatMessage> => {
	const provider = deps.findProviderByTagExact(modelTag);
	if (!provider) {
		throw new Error(`未找到模型配置: ${modelTag}`);
	}

		const providerOptionsRaw = provider.options ?? {};
	const providerEnableReasoning =
		typeof providerOptionsRaw.enableReasoning === 'boolean'
			? providerOptionsRaw.enableReasoning
			: provider.vendor === 'Doubao'
					? (String(providerOptionsRaw.thinkingType ?? 'enabled')) !== 'disabled'
				: false;
	const providerEnableThinking = providerOptionsRaw.enableThinking ?? false;
	const providerEnableWebSearch = provider.options.enableWebSearch ?? false;
	let enableReasoning = deps.state.enableReasoningToggle && providerEnableReasoning;
	let enableThinking = deps.state.enableReasoningToggle && providerEnableThinking;
	const enableWebSearch = deps.state.enableWebSearchToggle && providerEnableWebSearch;
	const providerOptions: BaseOptions = {
		...(providerOptionsRaw as BaseOptions),
		enableReasoning,
		enableThinking,
		enableWebSearch,
		apiKey: String(providerOptionsRaw.apiKey ?? ''),
		baseURL: String(providerOptionsRaw.baseURL ?? ''),
		model: String(providerOptionsRaw.model ?? ''),
		parameters:
			(providerOptionsRaw.parameters as Record<string, unknown> | undefined) ?? {},
	};
	let requestTools: ToolDefinition[] = options?.toolRuntimeOverride?.requestTools ?? [];

	if (!enableReasoning && typeof providerOptionsRaw.thinkingType === 'string') {
		providerOptions.thinkingType = 'disabled';
	}

	const vendor = availableVendors.find((item) => item.name === provider.vendor);
	if (!vendor) {
		throw new Error(`无法找到供应商 ${provider.vendor}`);
	}

	if (typeof options?.maxTokensOverride === 'number' && options.maxTokensOverride > 0) {
		providerOptions.max_tokens = options.maxTokensOverride;
	}

	const assistantMessage = deps.messageService.createMessage('assistant', '', {
		modelTag,
		modelName: deps.getModelDisplayName(provider),
		taskDescription: options?.taskDescription,
		executionIndex: options?.executionIndex,
		metadata: {
			hiddenFromModel: deps.state.multiModelMode !== 'single',
		},
	});
	const shouldAttachToSession = options?.createMessageInSession ?? false;
	const shouldManageGeneratingState = options?.manageGeneratingState ?? true;
	const subAgentStateCallback = deps.createSubAgentStateUpdater(
		assistantMessage,
		session,
		shouldAttachToSession
	);

	if (options?.toolRuntimeOverride) {
		providerOptions.tools = options.toolRuntimeOverride.requestTools;
		if (options.toolRuntimeOverride.toolExecutor) {
			providerOptions.toolExecutor = options.toolRuntimeOverride.toolExecutor;
		}
		if (options.toolRuntimeOverride.maxToolCallLoops) {
			providerOptions.maxToolCallLoops = options.toolRuntimeOverride.maxToolCallLoops;
		}
	} else {
		try {
			const toolRuntime = await deps.resolveToolRuntime({
				includeSubAgents: true,
				parentSessionId: session.id,
				subAgentStateCallback,
				session,
			});
			requestTools = toolRuntime.requestTools;
			providerOptions.tools = toolRuntime.requestTools;
			if (toolRuntime.toolExecutor) {
				providerOptions.toolExecutor = toolRuntime.toolExecutor;
			}
			if (toolRuntime.maxToolCallLoops) {
				providerOptions.maxToolCallLoops = toolRuntime.maxToolCallLoops;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			deps.showMcpNoticeOnce(`MCP 工具初始化失败: ${message}`);
			DebugLogger.error('[MCP] Chat 注入工具失败', error);
		}
	}

	if (vendor.name === 'Ollama') {
		const modelName = String(providerOptions.model ?? '');
		const baseURL = String(providerOptions.baseURL ?? '');
		if (modelName) {
			const caps = await deps.getOllamaCapabilities(baseURL, modelName);
			enableReasoning = enableReasoning && caps.reasoning;
			enableThinking = enableThinking && caps.reasoning;
			providerOptions.enableReasoning = enableReasoning;
			providerOptions.enableThinking = enableThinking;
			if (!caps.reasoning) {
				const key = `${deps.normalizeOllamaBaseUrl(baseURL)}|${modelName}`;
				const cached = deps.ollamaCapabilityCache.get(key);
				if (cached && !cached.warned) {
					deps.ollamaCapabilityCache.set(key, { ...cached, warned: true });
					new Notice(localInstance.chat_ollama_reasoning_disabled_notice);
				}
			}
		}
	}

	const sendRequest = vendor.sendRequestFunc(providerOptions);
	const messages = await deps.buildProviderMessagesWithOptions(session, {
		context: options?.context,
		taskDescription: options?.taskDescription,
		systemPrompt: options?.systemPromptOverride,
		modelTag,
		requestTools,
	});
	DebugLogger.logLlmMessages('ChatService.generateAssistantResponseForModel', messages, {
		level: 'debug',
	});
	const requestDebugMeta = {
		vendor: provider.vendor,
		model: providerOptions.model,
		baseURL: providerOptions.baseURL,
		messageCount: messages.length,
		requestToolsCount: requestTools.length,
		requestToolNames: requestTools.map((tool) => tool.name),
		readFileToolSchema: requestTools.find((tool) => tool.name === 'read_file')?.inputSchema,
		hasToolExecutor: Boolean(providerOptions.toolExecutor),
		enableReasoning,
		enableThinking,
		enableWebSearch,
	};
	const requestStartedAt = Date.now();
	let firstChunkLatencyMs: number | null = null;
	let chunkCount = 0;
	if (shouldAttachToSession) {
		session.messages.push(assistantMessage);
	}
	session.updatedAt = Date.now();
	if (shouldManageGeneratingState) {
		deps.state.isGenerating = true;
		deps.state.error = undefined;
		deps.emitState();
	}

	const requestController = new AbortController();
	const externalSignal = options?.abortSignal;
	const abortListener = () => requestController.abort();
	if (externalSignal) {
		if (externalSignal.aborted) {
			requestController.abort();
		} else {
			externalSignal.addEventListener('abort', abortListener, { once: true });
		}
	}
	if (shouldAttachToSession) {
		deps.setController(requestController);
	}

	const resolveEmbed = createResolveEmbed(deps.imageResolver);
	const saveAttachment = createSaveAttachment(deps.app);

	providerOptions.onToolCallResult = (record: ToolExecutionRecord) => {
		updateAssistantToolCallRecord(
			deps,
			assistantMessage,
			session,
			record,
			shouldAttachToSession,
			options?.onToolCallRecord
		);
	};

	const appendChunk = (chunk: string) => {
		if (firstChunkLatencyMs === null) {
			firstChunkLatencyMs = Date.now() - requestStartedAt;
			if (firstChunkLatencyMs >= 3000) {
				DebugLogger.warn('[ChatService] 首包耗时偏高', {
					...requestDebugMeta,
					firstChunkLatencyMs,
				});
			}
		}
		chunkCount += 1;
		assistantMessage.content += chunk;
		session.updatedAt = Date.now();
		options?.onChunk?.(chunk, assistantMessage);
		if (shouldAttachToSession) {
			deps.emitState();
		}
	};

	try {
		DebugLogger.warn('[ChatService] 开始请求模型', requestDebugMeta);
		const supportsImageGeneration = deps.providerSupportsImageGeneration(provider);
		if (supportsImageGeneration) {
			try {
				for await (const chunk of sendRequest(
					messages,
					requestController,
					resolveEmbed,
					saveAttachment
				)) {
					appendChunk(chunk);
				}
			} catch (error) {
				deps.rethrowImageGenerationError(error);
			}
		} else {
			for await (const chunk of sendRequest(messages, requestController, resolveEmbed)) {
				appendChunk(chunk);
			}
		}

		const totalDurationMs = Date.now() - requestStartedAt;
		if (totalDurationMs >= 3000) {
			DebugLogger.warn('[ChatService] 模型响应耗时偏高', {
				...requestDebugMeta,
				totalDurationMs,
				firstChunkLatencyMs,
				chunkCount,
			});
		}

		DebugLogger.logLlmResponsePreview(
			'ChatService.generateAssistantResponseForModel',
			assistantMessage.content,
			{
				level: 'debug',
				previewChars: 100,
			}
		);
		return assistantMessage;
	} catch (error) {
		DebugLogger.error('[ChatService] 模型请求失败', {
			...requestDebugMeta,
			totalDurationMs: Date.now() - requestStartedAt,
			firstChunkLatencyMs,
			chunkCount,
			error,
		});
		throw error;
	} finally {
		if (externalSignal) {
			externalSignal.removeEventListener('abort', abortListener);
		}
		if (shouldAttachToSession && deps.getController() === requestController) {
			deps.setController(null);
		}
		if (shouldManageGeneratingState) {
			deps.state.isGenerating = false;
		}
		session.updatedAt = Date.now();
		if (shouldManageGeneratingState || shouldAttachToSession) {
			deps.emitState();
		}
	}
};
