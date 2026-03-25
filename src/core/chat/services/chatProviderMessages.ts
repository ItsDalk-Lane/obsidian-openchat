import type { App } from 'obsidian';
import { SystemPromptAssembler } from 'src/core/services/SystemPromptAssembler';
import { composeChatSystemPrompt } from 'src/core/services/PromptBuilder';
import { resolveContextBudget, type ResolvedContextBudget } from 'src/core/chat/utils/contextBudget';
import {
	estimateProviderMessagesTokens,
	estimateRequestPayloadTokens,
	estimateToolDefinitionTokens,
} from 'src/core/chat/utils/token';
import { filterMessagesForCompareModel } from 'src/core/chat/utils/compareContext';
import type { Message as ProviderMessage, ProviderSettings } from 'src/types/provider';
import type { ToolDefinition } from 'src/types/tool';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { ChatContextCompactionService } from './ChatContextCompactionService';
import type { FileContentOptions } from './FileContentService';
import type { MessageContextOptimizer } from './MessageContextOptimizer';
import type { MessageService } from './MessageService';
import type {
	ChatContextCompactionState,
	ChatMessage,
	ChatRequestTokenState,
	ChatSession,
	ChatSettings,
	ChatState,
	MessageManagementSettings,
} from '../types/chat';
import {
	DEFAULT_MESSAGE_MANAGEMENT_SETTINGS,
	normalizeMessageManagementSettings,
} from '../types/chat';
import {
	buildResolvedSelectionContext,
	createHistorySummaryGenerator,
	estimateSystemPromptTokens,
	getLatestContextSourceMessage,
	getStringMetadata,
	hasBuildableContextPayload,
	mergeCompactionState,
} from './chatContextHelpers';
import { buildLivePlanGuidance, buildLivePlanUserContext } from './chatPlanPrompts';
interface ChatProviderMessageDeps {
	app: App;
	state: Pick<ChatState, 'contextNotes' | 'multiModelMode' | 'selectedModelId'>;
	settings: ChatSettings;
	pluginChatSettings: ChatSettings;
	messageService: MessageService;
	messageContextOptimizer: MessageContextOptimizer;
	contextCompactionService: ChatContextCompactionService;
	getDefaultProviderTag: () => string | null;
	resolveProviderByTag: (tag?: string) => ProviderSettings | null;
	findProviderByTagExact: (tag?: string) => ProviderSettings | null;
	resolveSkillsSystemPromptBlock: (
		requestTools: ToolDefinition[]
	) => Promise<string | undefined>;
	persistSessionContextCompactionFrontmatter: (
		session: ChatSession
	) => Promise<void>;
}
const serializeContextCompaction = (
	compaction: ChatContextCompactionState | null | undefined
): string => JSON.stringify(compaction ?? null);
const serializeRequestTokenState = (
	state: ChatRequestTokenState | null | undefined
): string => JSON.stringify(state ?? null);
export const getChatMessageManagementSettings = (
	settings: ChatSettings,
	pluginChatSettings: ChatSettings
): MessageManagementSettings => {
	return normalizeMessageManagementSettings({
		...DEFAULT_MESSAGE_MANAGEMENT_SETTINGS,
		...(settings.messageManagement ?? {}),
		...(pluginChatSettings.messageManagement ?? {}),
	});
};
export const getChatDefaultFileContentOptions = (): FileContentOptions => {
	return {
		maxFileSize: 1024 * 1024,
		maxContentLength: 10000,
		includeExtensions: [],
		excludeExtensions: ['exe', 'dll', 'bin', 'zip', 'rar', 'tar', 'gz'],
		excludePatterns: [
			/node_modules/,
			/\.git/,
			/\.DS_Store/,
			/Thumbs\.db/,
		],
	};
};
export const resolveChatContextBudget = (
	deps: Pick<ChatProviderMessageDeps, 'resolveProviderByTag' | 'state'>,
	modelTag?: string | null
): ResolvedContextBudget => {
	return resolveContextBudget(
			deps.resolveProviderByTag(modelTag ?? deps.state.selectedModelId ?? undefined)
		);
};
export const buildProviderMessages = async (
	deps: ChatProviderMessageDeps,
	session: ChatSession
): Promise<ProviderMessage[]> => {
	const visibleMessages = session.messages.filter((message) => !message.metadata?.hiddenFromModel);
	return await buildProviderMessagesForAgent(
		deps,
		visibleMessages,
		session,
		undefined,
			session.modelId || deps.state.selectedModelId || undefined
		);
};
export const buildProviderMessagesWithOptions = async (
	deps: ChatProviderMessageDeps,
	session: ChatSession,
	options?: {
		context?: string;
		taskDescription?: string;
		systemPrompt?: string;
		modelTag?: string;
		requestTools?: ToolDefinition[];
	}
): Promise<ProviderMessage[]> => {
	const visibleMessages =
		(session.multiModelMode ?? deps.state.multiModelMode) === 'compare' && options?.modelTag
			? filterMessagesForCompareModel(session.messages, options.modelTag)
			: session.messages.filter((message) => !message.metadata?.hiddenFromModel);
	const requestMessages = [...visibleMessages];

	if (options?.context || options?.taskDescription) {
		const contextParts: string[] = [];
		if (options.taskDescription) {
			contextParts.push(`当前任务：${options.taskDescription}`);
		}
		if (options.context) {
			contextParts.push(`前一步输出：\n${options.context}`);
		}
		requestMessages.push(
			deps.messageService.createMessage('user', contextParts.join('\n\n'), {
				metadata: {
					hidden: true,
					hiddenFromHistory: true,
					hiddenFromModel: false,
					isEphemeralContext: true,
				},
				})
			);
		}
		const livePlanContext = buildLivePlanUserContext(session.livePlan);
		if (livePlanContext) {
		requestMessages.push(
			deps.messageService.createMessage('user', livePlanContext, {
				metadata: {
					hidden: true,
					hiddenFromHistory: true,
					hiddenFromModel: false,
					isEphemeralContext: true,
				},
				})
			);
		}
		return await buildProviderMessagesForAgent(
			deps,
			requestMessages,
		session,
		options?.systemPrompt,
		options?.modelTag,
			options?.requestTools
		);
};
export const buildProviderMessagesForAgent = async (
	deps: ChatProviderMessageDeps,
	messages: ChatMessage[],
	session: ChatSession,
	systemPrompt?: string,
	modelTag?: string,
	requestTools: ToolDefinition[] = []
): Promise<ProviderMessage[]> => {
	const contextNotes = [...(session.contextNotes ?? []), ...deps.state.contextNotes];
	const { selectedFiles, selectedFolders } = buildResolvedSelectionContext(session);
	const messageManagement = getChatMessageManagementSettings(
		deps.settings,
		deps.pluginChatSettings
	);
	const fileContentOptions = getChatDefaultFileContentOptions();
	const explicitSystemPrompt = systemPrompt?.trim();
	const templateSystemPrompt = session.enableTemplateAsSystemPrompt
		? session.systemPrompt?.trim()
		: undefined;
	let effectiveSystemPrompt = explicitSystemPrompt || templateSystemPrompt;
	if (!effectiveSystemPrompt) {
		try {
			const assembler = new SystemPromptAssembler(deps.app);
			const built = await assembler.buildGlobalSystemPrompt('ai_chat');
			if (built && built.trim().length > 0) {
				effectiveSystemPrompt = built;
				session.systemPrompt = effectiveSystemPrompt;
			} else if (!session.enableTemplateAsSystemPrompt) {
				session.systemPrompt = undefined;
			}
		} catch (error) {
			DebugLogger.warn('[ChatService] 全局系统提示词加载失败，跳过注入', error);
		}
	}

	const activePlanGuidance = buildLivePlanGuidance(session.livePlan);
	const skillsPromptBlock = await deps.resolveSkillsSystemPromptBlock(requestTools);
	effectiveSystemPrompt = composeChatSystemPrompt({
		configuredSystemPrompt: effectiveSystemPrompt,
		livePlanGuidance: activePlanGuidance,
		skillsPromptBlock,
	});
	const sourcePath = deps.app.workspace.getActiveFile()?.path ?? '';

	const contextSourceMessage = getLatestContextSourceMessage(messages);
	const selectedText = getStringMetadata(contextSourceMessage, 'selectedText');
	const hasContextPayload = hasBuildableContextPayload(
		contextNotes,
		selectedFiles,
		selectedFolders,
		selectedText
	);
	const rawContextMessage = hasContextPayload
		? await deps.messageService.buildContextProviderMessage({
			selectedFiles,
			selectedFolders,
			contextNotes,
			selectedText,
			fileContentOptions,
			sourcePath,
			images: contextSourceMessage?.images ?? [],
		})
		: null;
	let requestMessages = messages.filter((message) => message.role !== 'system');
	let prebuiltContextMessage = rawContextMessage;
	let nextCompaction = session.contextCompaction ?? null;
	const resolvedBudget = resolveChatContextBudget(
		deps,
		modelTag ?? session.modelId ?? deps.state.selectedModelId ?? undefined
	);
	const systemTokenEstimate = estimateSystemPromptTokens(effectiveSystemPrompt);
	const toolTokenEstimate = estimateToolDefinitionTokens(requestTools);
	const buildProviderPayload = (
		currentMessages: ChatMessage[],
		currentContextMessage: ProviderMessage | null
	) =>
		deps.messageService.toProviderMessages(currentMessages, {
			contextNotes,
			systemPrompt: effectiveSystemPrompt,
			selectedFiles,
			selectedFolders,
			fileContentOptions,
			sourcePath,
			prebuiltContextMessage: currentContextMessage,
		});

	let providerMessages = await buildProviderPayload(
		requestMessages,
		prebuiltContextMessage
	);
	let requestEstimate = estimateRequestPayloadTokens({
		messages: providerMessages,
		tools: requestTools,
	});

	if (messageManagement.enabled) {
		const rawContextTokens = rawContextMessage
			? estimateProviderMessagesTokens([rawContextMessage])
			: 0;
		let contextTokenEstimate = rawContextTokens;
		let historyTokenEstimate = deps.messageContextOptimizer.estimateChatTokens(
			requestMessages
		);
		let totalTokenEstimate = requestEstimate.totalTokens;
		const shouldCompact = totalTokenEstimate > resolvedBudget.triggerTokens;

		if (shouldCompact) {
			const summaryGenerator = createHistorySummaryGenerator({
				modelTag,
				session,
				messageManagement,
				selectedModelId: deps.state.selectedModelId,
				getDefaultProviderTag: deps.getDefaultProviderTag,
				findProviderByTagExact: deps.findProviderByTagExact,
			});
			let optimized = await deps.messageContextOptimizer.optimize(
				requestMessages,
				messageManagement,
				nextCompaction,
				{
					targetHistoryBudgetTokens: Math.max(
						1,
						resolvedBudget.targetTokens
							- systemTokenEstimate
							- contextTokenEstimate
							- toolTokenEstimate
					),
					summaryGenerator,
				}
			);
			requestMessages = optimized.messages;
			historyTokenEstimate = optimized.historyTokenEstimate;
			providerMessages = await buildProviderPayload(
				requestMessages,
				prebuiltContextMessage
			);
			requestEstimate = estimateRequestPayloadTokens({
				messages: providerMessages,
				tools: requestTools,
			});
			totalTokenEstimate = requestEstimate.totalTokens;

			if (rawContextMessage && totalTokenEstimate > resolvedBudget.targetTokens) {
				const contextCompaction =
					await deps.contextCompactionService.compactContextProviderMessage({
						contextMessage: rawContextMessage,
						existingCompaction: nextCompaction,
						session,
						modelTag,
						targetBudgetTokens: Math.max(
							256,
							resolvedBudget.targetTokens
								- systemTokenEstimate
								- historyTokenEstimate
								- toolTokenEstimate
						),
					});
				prebuiltContextMessage = contextCompaction.message;
				contextTokenEstimate = contextCompaction.tokenEstimate;
				providerMessages = await buildProviderPayload(
					requestMessages,
					prebuiltContextMessage
				);
				requestEstimate = estimateRequestPayloadTokens({
					messages: providerMessages,
					tools: requestTools,
				});
				totalTokenEstimate = requestEstimate.totalTokens;

				if (totalTokenEstimate > resolvedBudget.targetTokens) {
					optimized = await deps.messageContextOptimizer.optimize(
						messages.filter((message) => message.role !== 'system'),
						messageManagement,
						optimized.contextCompaction ?? nextCompaction,
						{
							targetHistoryBudgetTokens: Math.max(
								1,
								resolvedBudget.targetTokens
									- systemTokenEstimate
									- contextTokenEstimate
									- toolTokenEstimate
							),
							summaryGenerator,
						}
					);
					requestMessages = optimized.messages;
					historyTokenEstimate = optimized.historyTokenEstimate;
					providerMessages = await buildProviderPayload(
						requestMessages,
						prebuiltContextMessage
					);
					requestEstimate = estimateRequestPayloadTokens({
						messages: providerMessages,
						tools: requestTools,
					});
					totalTokenEstimate = requestEstimate.totalTokens;
				}

				nextCompaction = mergeCompactionState(
					optimized.contextCompaction,
					contextCompaction.summary,
					contextCompaction.signature,
					contextTokenEstimate,
					totalTokenEstimate
				);
			} else if (optimized.contextCompaction) {
				nextCompaction = {
					...optimized.contextCompaction,
					totalTokenEstimate,
					contextTokenEstimate,
				};
			} else if (nextCompaction) {
				nextCompaction = {
					...nextCompaction,
					historyTokenEstimate,
					totalTokenEstimate,
					contextTokenEstimate,
				};
			} else {
				nextCompaction = null;
			}
		} else if (nextCompaction) {
			nextCompaction = {
				...nextCompaction,
				historyTokenEstimate,
				totalTokenEstimate: requestEstimate.totalTokens,
				contextTokenEstimate,
			};
		} else {
			nextCompaction = null;
		}

		if (!rawContextMessage && nextCompaction) {
			nextCompaction = {
				...nextCompaction,
				contextSummary: undefined,
				contextSourceSignature: undefined,
				contextTokenEstimate: undefined,
			};
		}

		if (
			nextCompaction
			&& nextCompaction.coveredRange.messageCount === 0
			&& !nextCompaction.summary.trim()
			&& !nextCompaction.contextSummary
			&& !nextCompaction.overflowedProtectedLayers
		) {
			nextCompaction = null;
		}
	} else if (session.contextCompaction) {
		nextCompaction = null;
	}

	if (
		serializeContextCompaction(session.contextCompaction)
		!== serializeContextCompaction(nextCompaction)
	) {
		session.contextCompaction = nextCompaction;
		void deps.persistSessionContextCompactionFrontmatter(session);
	}

	providerMessages = await buildProviderPayload(
		requestMessages,
		prebuiltContextMessage
	);
	requestEstimate = estimateRequestPayloadTokens({
		messages: providerMessages,
		tools: requestTools,
	});
	await updateRequestTokenState(deps, session, {
		requestEstimate,
		contextMessage: prebuiltContextMessage,
		contextSourceMessage,
		sourcePath,
		fileContentOptions,
	});

	return providerMessages;
};

const updateRequestTokenState = async (
	deps: ChatProviderMessageDeps,
	session: ChatSession,
	params: {
		requestEstimate: ReturnType<typeof estimateRequestPayloadTokens>;
		contextMessage: ProviderMessage | null;
		contextSourceMessage: ChatMessage | null;
		sourcePath: string;
		fileContentOptions: FileContentOptions;
	}
): Promise<void> => {
	let userTurnTokenEstimate: number | undefined;
	if (params.contextSourceMessage) {
		const taskMessages = await deps.messageService.toProviderMessages(
			[params.contextSourceMessage],
			{
				contextNotes: [],
				selectedFiles: [],
				selectedFolders: [],
				fileContentOptions: params.fileContentOptions,
				sourcePath: params.sourcePath,
				prebuiltContextMessage: null,
			}
		);
		const userTurnMessages = [
			...(params.contextMessage ? [params.contextMessage] : []),
			...taskMessages.filter((message) => message.role === 'user'),
		];
		userTurnTokenEstimate = estimateProviderMessagesTokens(userTurnMessages);
		params.contextSourceMessage.metadata = {
			...(params.contextSourceMessage.metadata ?? {}),
			userTurnTokenEstimate,
		};
	}

	const nextState: ChatRequestTokenState = {
		totalTokenEstimate: params.requestEstimate.totalTokens,
		messageTokenEstimate: params.requestEstimate.messageTokens,
		toolTokenEstimate: params.requestEstimate.toolTokens,
		userTurnTokenEstimate,
		updatedAt: Date.now(),
	};

	if (
		serializeRequestTokenState(session.requestTokenState)
		!== serializeRequestTokenState(nextState)
	) {
		session.requestTokenState = nextState;
		void deps.persistSessionContextCompactionFrontmatter(session);
	}
};
