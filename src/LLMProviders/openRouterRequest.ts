import { OpenRouter } from '@openrouter/sdk'
import { Notice } from 'obsidian'
import { t } from 'src/i18n/ai-runtime/helper'
import { DebugLogger } from 'src/utils/DebugLogger'
import { mergeProviderOptionsWithParameters } from '.'
import type {
	Message,
	ResolveEmbedAsBinary,
	SaveAttachment,
	SendRequest,
} from '.'
import { getCapabilityEmoji } from './utils'
import { normalizeProviderError } from './errors'
import { buildOpenRouterHTTPError } from './openRouterErrors'
import { formatOpenRouterMessage } from './openRouterMessageFormat'
import { handleOpenRouterCallModelResult, handleOpenRouterChatResponse } from './openRouterResponses'
import {
	isImageGenerationModel,
	normalizeOpenRouterBaseURL,
	type OpenRouterOptions,
	type WebSearchPlugin,
} from './openRouterShared'

const OPENROUTER_HTTP_REFERER = 'https://github.com/ItsDalk-Lane/obsidian-openchat'
const OPENROUTER_X_TITLE = 'obsidian-openchat'

type OpenRouterCallModelRequest = Parameters<OpenRouter['callModel']>[0]
type OpenRouterRequestOptions = NonNullable<Parameters<OpenRouter['callModel']>[1]>
type OpenRouterChatRequest = {
	chatGenerationParams: Record<string, unknown>
}

const IMAGE_GENERATION_PROMPT_PATTERNS = ['生成图片', '生成图像', 'generate image']

const isPromptingImageGeneration = (messages: readonly Message[]): boolean =>
	messages.some((message) => {
		const content = message.content?.toLowerCase()
		if (!content) return false
		return IMAGE_GENERATION_PROMPT_PATTERNS.some((pattern) => content.includes(pattern))
	})

const normalizeRequestParameters = (parameters: Record<string, unknown>): Record<string, unknown> => {
	const normalized = { ...parameters }
	const aliases: Array<[target: string, source: string]> = [
		['maxTokens', 'max_tokens'],
		['maxOutputTokens', 'max_output_tokens'],
		['topP', 'top_p'],
		['frequencyPenalty', 'frequency_penalty'],
		['presencePenalty', 'presence_penalty'],
		['responseFormat', 'response_format'],
		['streamOptions', 'stream_options'],
		['toolChoice', 'tool_choice'],
		['parallelToolCalls', 'parallel_tool_calls'],
		['imageConfig', 'image_config'],
		['sessionId', 'session_id'],
		['promptCacheKey', 'prompt_cache_key'],
	]

	for (const [target, source] of aliases) {
		if (normalized[target] === undefined && normalized[source] !== undefined) {
			normalized[target] = normalized[source]
		}
		delete normalized[source]
	}

	return normalized
}

const createOpenRouterClient = (apiKey: string) =>
	new OpenRouter({
		apiKey,
		httpReferer: OPENROUTER_HTTP_REFERER,
		xTitle: OPENROUTER_X_TITLE,
	})

const createOpenRouterRequestOptions = (
	baseURL: string,
	controller: AbortController,
): OpenRouterRequestOptions => ({
	serverURL: normalizeOpenRouterBaseURL(baseURL),
	fetchOptions: {
		signal: controller.signal,
	},
})

const createOpenRouterWebPlugin = (
	webSearchEngine: OpenRouterOptions['webSearchEngine'],
	webSearchMaxResults: number,
	webSearchPrompt: string | undefined,
): WebSearchPlugin => ({
	id: 'web',
	enabled: true,
	...(webSearchEngine ? { engine: webSearchEngine } : {}),
	...(webSearchMaxResults !== 5 ? { maxResults: webSearchMaxResults } : {}),
	...(webSearchPrompt ? { searchPrompt: webSearchPrompt } : {}),
})

const toResponsesInput = async (
	messages: readonly Message[],
	resolveEmbedAsBinary: ResolveEmbedAsBinary,
) => {
	const formattedMessages = await Promise.all(
		messages.map((message) => formatOpenRouterMessage(message, resolveEmbedAsBinary, true))
	)

	return formattedMessages.map((message) => ({
		type: 'message' as const,
		role: message.role,
		content: Array.isArray(message.content)
			? message.content
			: [{ type: 'input_text' as const, text: String(message.content ?? '') }],
	}))
}

const toChatMessages = async (
	messages: readonly Message[],
	resolveEmbedAsBinary: ResolveEmbedAsBinary,
) => Promise.all(messages.map((message) => formatOpenRouterMessage(message, resolveEmbedAsBinary, false)))

const createOpenRouterCallModelRequest = async (
	messages: readonly Message[],
	resolveEmbedAsBinary: ResolveEmbedAsBinary,
	model: string,
	parameters: Record<string, unknown>,
	options: Pick<OpenRouterOptions, 'enableReasoning' | 'reasoningEffort' | 'enableWebSearch' | 'webSearchEngine' | 'webSearchMaxResults' | 'webSearchPrompt'>,
): Promise<OpenRouterCallModelRequest> => {
	const normalizedParameters = normalizeRequestParameters(parameters)
	const request = {
		...normalizedParameters,
		model,
		input: await toResponsesInput(messages, resolveEmbedAsBinary),
	} as Record<string, unknown>

	delete request.messages
	delete request.stream
	delete request.responseFormat

	if (typeof request.maxOutputTokens !== 'number') {
		request.maxOutputTokens = typeof request.maxTokens === 'number' ? request.maxTokens : 9000
	}
	delete request.maxTokens

	if (options.enableReasoning) {
		request.reasoning = {
			enabled: true,
			effort: options.reasoningEffort,
		}
	}

	if (options.enableWebSearch) {
		request.plugins = [
			createOpenRouterWebPlugin(
				options.webSearchEngine,
				options.webSearchMaxResults ?? 5,
				options.webSearchPrompt,
			),
		]
	}

	return request as OpenRouterCallModelRequest
}

const createOpenRouterChatRequest = async (
	messages: readonly Message[],
	resolveEmbedAsBinary: ResolveEmbedAsBinary,
	model: string,
	parameters: Record<string, unknown>,
	options: Pick<
		OpenRouterOptions,
		| 'enableWebSearch'
		| 'webSearchEngine'
		| 'webSearchMaxResults'
		| 'webSearchPrompt'
		| 'imageAspectRatio'
		| 'imageStream'
		| 'imageResponseFormat'
	> & {
		isImageGenerationRequest: boolean
		supportsImageGeneration: boolean
	},
): Promise<OpenRouterChatRequest> => {
	const normalizedParameters = normalizeRequestParameters(parameters)
	const chatGenerationParams: Record<string, unknown> = {
		...normalizedParameters,
		model,
		messages: await toChatMessages(messages, resolveEmbedAsBinary),
		stream: options.imageStream || !options.isImageGenerationRequest,
	}

	if (options.supportsImageGeneration) {
		chatGenerationParams.modalities = ['image', 'text']
		chatGenerationParams.responseFormat = options.imageResponseFormat
		if (options.imageAspectRatio) {
			chatGenerationParams.imageConfig = {
				...(typeof normalizedParameters.imageConfig === 'object' && normalizedParameters.imageConfig !== null
					? normalizedParameters.imageConfig as Record<string, unknown>
					: {}),
				aspect_ratio: options.imageAspectRatio,
			}
		}
	}

	if (options.enableWebSearch && !options.supportsImageGeneration) {
		chatGenerationParams.plugins = [
			createOpenRouterWebPlugin(
				options.webSearchEngine,
				options.webSearchMaxResults ?? 5,
				options.webSearchPrompt,
			),
		]
	}

	return { chatGenerationParams }
}

const mapOpenRouterSdkError = (
	error: unknown,
	model: string,
	supportsImageGeneration: boolean,
) => {
	if (error && typeof error === 'object') {
		const sdkError = error as {
			response?: {
				status?: unknown
				data?: unknown
			}
		}
		const status = typeof sdkError.response?.status === 'number'
			? sdkError.response.status
			: undefined
		if (typeof status === 'number') {
			const responseData = sdkError.response?.data
			const errorText = typeof responseData === 'string'
				? responseData
				: JSON.stringify(responseData ?? {})
			return buildOpenRouterHTTPError(status, errorText, model, supportsImageGeneration)
		}
	}

	const normalized = normalizeProviderError(error, 'OpenRouter request failed')
	if (normalized.isAbort) {
		return normalized
	}
	if (typeof normalized.status === 'number') {
		return buildOpenRouterHTTPError(
			normalized.status,
			normalized.message,
			model,
			supportsImageGeneration,
		)
	}
	return normalized
}

export const createOpenRouterSendRequest = (settings: OpenRouterOptions): SendRequest =>
	async function* (
		messages: readonly Message[],
		controller: AbortController,
		resolveEmbedAsBinary: ResolveEmbedAsBinary,
		saveAttachment?: SaveAttachment,
	) {
		try {
			const options = mergeProviderOptionsWithParameters(settings)
			const {
				apiKey,
				baseURL,
				model,
				enableWebSearch = false,
				webSearchEngine,
				webSearchMaxResults = 5,
				webSearchPrompt,
				imageAspectRatio,
				imageStream = false,
				imageResponseFormat = 'b64_json',
				imageSaveAsAttachment = true,
				imageDisplayWidth = 400,
				enableReasoning = false,
				reasoningEffort = 'medium',
				...remains
			} = options

			if (!apiKey) throw new Error(t('API key is required'))
			if (!model) throw new Error(t('Model is required'))

			const useResponsesAPI = enableReasoning
			const supportsImageGeneration = isImageGenerationModel(String(model))
			const isImageGenerationRequest =
				supportsImageGeneration || isPromptingImageGeneration(messages)

			if (isImageGenerationRequest && imageSaveAsAttachment && !saveAttachment) {
				DebugLogger.warn('⚠️ 图像生成配置为保存附件，但未提供 saveAttachment 函数，将返回 URL 格式')
			}

			const client = createOpenRouterClient(String(apiKey))
			const requestOptions = createOpenRouterRequestOptions(String(baseURL), controller)

			const responseContext = {
				useResponsesAPI,
				imageSaveAsAttachment,
				saveAttachment,
				imageDisplayWidth,
				supportsImageGeneration,
				imageStream,
				controller,
			}

			if (enableReasoning) {
				new Notice(
					`${getCapabilityEmoji('Reasoning')}${t('Reasoning mode notice')
						.replace('{effort}', String(reasoningEffort))
						.replace('{model}', String(model))}`
				)
				const request = await createOpenRouterCallModelRequest(
					messages,
					resolveEmbedAsBinary,
					String(model),
					remains as Record<string, unknown>,
					{
						enableReasoning,
						reasoningEffort,
						enableWebSearch,
						webSearchEngine,
						webSearchMaxResults,
						webSearchPrompt,
					},
				)
				const result = client.callModel(request, requestOptions)
				yield* handleOpenRouterCallModelResult(result, responseContext)
				return
			}

			if (supportsImageGeneration) {
				new Notice(`${getCapabilityEmoji('Image Generation')}${t('Image generation mode')}`)
			}

			if (enableWebSearch && !supportsImageGeneration) {
				new Notice(`${getCapabilityEmoji('Web Search')}${t('Web search mode')}`)
			}

			const response = await client.chat.send(
				await createOpenRouterChatRequest(
					messages,
					resolveEmbedAsBinary,
					String(model),
					remains as Record<string, unknown>,
					{
						enableWebSearch,
						webSearchEngine,
						webSearchMaxResults,
						webSearchPrompt,
						imageAspectRatio,
						imageStream,
						imageResponseFormat,
						isImageGenerationRequest,
						supportsImageGeneration,
					},
				),
				requestOptions,
			)
			yield* handleOpenRouterChatResponse(response, responseContext)
		} catch (error) {
			throw mapOpenRouterSdkError(error, String(settings.model || ''), isImageGenerationModel(String(settings.model || '')))
		}
	}
