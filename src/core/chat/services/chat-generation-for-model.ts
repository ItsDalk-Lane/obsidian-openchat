import type { ToolExecutionRecord } from 'src/types/tool';
import { availableVendors } from 'src/domains/settings/config-ai-runtime-vendors';
import { localInstance } from 'src/i18n/locals';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { ChatMessage, ChatSession } from '../types/chat';
import type { GenerateAssistantOptions } from './chat-service-types';
import type { ChatGenerationDeps } from './chat-generation';
import {
	buildProviderOptions,
	createResolveEmbed,
	createSaveAttachment,
	updateAssistantToolCallRecord,
} from './chat-generation-request-support';

export const generateAssistantResponseForModelImpl = async (
	deps: ChatGenerationDeps,
	session: ChatSession,
	modelTag: string,
	options?: GenerateAssistantOptions,
): Promise<ChatMessage> => {
	const provider = deps.findProviderByTagExact(modelTag);
	if (!provider) {
		throw new Error(`未找到模型配置: ${modelTag}`);
	}
	let requestTools = options?.toolRuntimeOverride?.requestTools ?? [];
	const {
		providerOptions,
		enableReasoning,
		enableThinking,
		enableWebSearch,
	} = buildProviderOptions(deps, provider, options);
	const vendor = availableVendors.find((item) => item.name === provider.vendor);
	if (!vendor) {
		throw new Error(`无法找到供应商 ${provider.vendor}`);
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
		shouldAttachToSession,
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
			providerOptions.enableReasoning = enableReasoning && caps.reasoning;
			providerOptions.enableThinking = enableThinking && caps.reasoning;
			if (!caps.reasoning) {
				const key = `${deps.normalizeOllamaBaseUrl(baseURL)}|${modelName}`;
				const cached = deps.ollamaCapabilityCache.get(key);
				if (cached && !cached.warned) {
					deps.ollamaCapabilityCache.set(key, { ...cached, warned: true });
					deps.notify(localInstance.chat_ollama_reasoning_disabled_notice);
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
		readFileToolSchema:
			requestTools.find((tool) => tool.name === 'read_file')?.inputSchema,
		hasToolExecutor: Boolean(providerOptions.toolExecutor),
		enableReasoning: providerOptions.enableReasoning,
		enableThinking: providerOptions.enableThinking,
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
	const handleAbort = () => requestController.abort();
	if (externalSignal) {
		if (externalSignal.aborted) {
			requestController.abort();
		} else {
			externalSignal.addEventListener('abort', handleAbort, { once: true });
		}
	}
	if (shouldAttachToSession) {
		deps.setController(requestController);
	}
	const resolveEmbed = createResolveEmbed(deps);
	const saveAttachment = createSaveAttachment(deps);
	providerOptions.onToolCallResult = (record: ToolExecutionRecord) => {
		updateAssistantToolCallRecord(
			deps,
			assistantMessage,
			session,
			record,
			shouldAttachToSession,
			options?.onToolCallRecord,
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
					saveAttachment,
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
			},
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
			externalSignal.removeEventListener('abort', handleAbort);
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
