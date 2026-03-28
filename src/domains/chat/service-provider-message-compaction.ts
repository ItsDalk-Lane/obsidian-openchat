import type { Message as ProviderMessage } from 'src/types/provider'
import type { ToolDefinition } from 'src/types/tool'
import type {
	MessageContextOptimizationResult,
	MessageContextSummaryGenerator,
	MessageContextOptimizer,
} from './service-context-compaction'
import { mergeCompactionState } from './service-provider-message-context'
import { normalizeContextCompactionState } from './service-provider-message-support'
import type {
	ChatContextCompactionState,
	ChatMessage,
	ChatSession,
	MessageManagementSettings,
} from './types'

export interface ChatRequestEstimate {
	totalTokens: number
	messageTokens: number
	toolTokens: number
}

interface ContextProviderCompactionResult {
	message: ProviderMessage | null
	summary: string
	signature: string
	tokenEstimate: number
}

export interface ProviderMessageCompactionDeps {
	messageContextOptimizer: Pick<MessageContextOptimizer, 'optimize' | 'estimateChatTokens'>
	buildProviderPayload: (
		currentMessages: ChatMessage[],
		currentContextMessage: ProviderMessage | null,
	) => Promise<ProviderMessage[]>
	estimateRequestPayload: (params: {
		messages: ProviderMessage[]
		tools: ToolDefinition[]
	}) => ChatRequestEstimate
	compactContextProviderMessage: (params: {
		contextMessage: ProviderMessage
		existingCompaction: ChatContextCompactionState | null
		session: ChatSession
		modelTag?: string
		targetBudgetTokens: number
	}) => Promise<ContextProviderCompactionResult>
}

export interface ProviderMessageCompactionRequest {
	requestMessages: ChatMessage[]
	providerMessages: ProviderMessage[]
	requestEstimate: ChatRequestEstimate
	rawContextMessage: ProviderMessage | null
	rawContextTokenEstimate: number
	nextCompaction: ChatContextCompactionState | null
	messageManagement: MessageManagementSettings
	requestTools: ToolDefinition[]
	resolvedBudget: {
		triggerTokens: number
		targetTokens: number
	}
	systemTokenEstimate: number
	toolTokenEstimate: number
	session: ChatSession
	modelTag?: string
	summaryGenerator?: MessageContextSummaryGenerator
}

export interface ProviderMessageCompactionResult {
	requestMessages: ChatMessage[]
	providerMessages: ProviderMessage[]
	requestEstimate: ChatRequestEstimate
	contextMessage: ProviderMessage | null
	nextCompaction: ChatContextCompactionState | null
	historyTokenEstimate: number
	contextTokenEstimate: number
	totalTokenEstimate: number
	optimized: MessageContextOptimizationResult | null
}

export const compactProviderMessages = async (
	deps: ProviderMessageCompactionDeps,
	params: ProviderMessageCompactionRequest,
): Promise<ProviderMessageCompactionResult> => {
	let requestMessages = params.requestMessages
	let providerMessages = params.providerMessages
	let requestEstimate = params.requestEstimate
	let prebuiltContextMessage = params.rawContextMessage
	let nextCompaction = params.nextCompaction
	let optimized: MessageContextOptimizationResult | null = null
	let contextTokenEstimate = params.rawContextTokenEstimate
	let historyTokenEstimate = deps.messageContextOptimizer.estimateChatTokens(
		requestMessages,
	)
	let totalTokenEstimate = requestEstimate.totalTokens

	if (totalTokenEstimate > params.resolvedBudget.triggerTokens) {
		optimized = await deps.messageContextOptimizer.optimize(
			requestMessages,
			params.messageManagement,
			nextCompaction,
			{
				targetHistoryBudgetTokens: Math.max(
					1,
					params.resolvedBudget.targetTokens
						- params.systemTokenEstimate
						- contextTokenEstimate
						- params.toolTokenEstimate,
				),
				summaryGenerator: params.summaryGenerator,
			},
		)
		requestMessages = optimized.messages
		historyTokenEstimate = optimized.historyTokenEstimate
		providerMessages = await deps.buildProviderPayload(
			requestMessages,
			prebuiltContextMessage,
		)
		requestEstimate = deps.estimateRequestPayload({
			messages: providerMessages,
			tools: params.requestTools,
		})
		totalTokenEstimate = requestEstimate.totalTokens

		if (params.rawContextMessage && totalTokenEstimate > params.resolvedBudget.targetTokens) {
			const contextCompaction = await deps.compactContextProviderMessage({
				contextMessage: params.rawContextMessage,
				existingCompaction: nextCompaction,
				session: params.session,
				modelTag: params.modelTag,
				targetBudgetTokens: Math.max(
					256,
					params.resolvedBudget.targetTokens
						- params.systemTokenEstimate
						- historyTokenEstimate
						- params.toolTokenEstimate,
				),
			})
			prebuiltContextMessage = contextCompaction.message
			contextTokenEstimate = contextCompaction.tokenEstimate
			providerMessages = await deps.buildProviderPayload(
				requestMessages,
				prebuiltContextMessage,
			)
			requestEstimate = deps.estimateRequestPayload({
				messages: providerMessages,
				tools: params.requestTools,
			})
			totalTokenEstimate = requestEstimate.totalTokens

			if (totalTokenEstimate > params.resolvedBudget.targetTokens) {
				optimized = await deps.messageContextOptimizer.optimize(
					params.requestMessages,
					params.messageManagement,
					optimized.contextCompaction ?? nextCompaction,
					{
						targetHistoryBudgetTokens: Math.max(
							1,
							params.resolvedBudget.targetTokens
								- params.systemTokenEstimate
								- contextTokenEstimate
								- params.toolTokenEstimate,
						),
						summaryGenerator: params.summaryGenerator,
					},
				)
				requestMessages = optimized.messages
				historyTokenEstimate = optimized.historyTokenEstimate
				providerMessages = await deps.buildProviderPayload(
					requestMessages,
					prebuiltContextMessage,
				)
				requestEstimate = deps.estimateRequestPayload({
					messages: providerMessages,
					tools: params.requestTools,
				})
				totalTokenEstimate = requestEstimate.totalTokens
			}

			nextCompaction = mergeCompactionState(
				optimized.contextCompaction,
				contextCompaction.summary,
				contextCompaction.signature,
				contextTokenEstimate,
				totalTokenEstimate,
			)
		} else if (optimized.contextCompaction) {
			nextCompaction = {
				...optimized.contextCompaction,
				totalTokenEstimate,
				contextTokenEstimate,
			}
		} else if (nextCompaction) {
			nextCompaction = {
				...nextCompaction,
				historyTokenEstimate,
				totalTokenEstimate,
				contextTokenEstimate,
			}
		} else {
			nextCompaction = null
		}
	} else if (nextCompaction) {
		nextCompaction = {
			...nextCompaction,
			historyTokenEstimate,
			totalTokenEstimate: requestEstimate.totalTokens,
			contextTokenEstimate,
		}
	} else {
		nextCompaction = null
	}

	return {
		requestMessages,
		providerMessages,
		requestEstimate,
		contextMessage: prebuiltContextMessage,
		nextCompaction: normalizeContextCompactionState(
			nextCompaction,
			Boolean(params.rawContextMessage),
		),
		historyTokenEstimate,
		contextTokenEstimate,
		totalTokenEstimate,
		optimized,
	}
}