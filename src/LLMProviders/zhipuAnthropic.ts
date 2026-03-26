import { requestUrl, type EmbedCache } from 'obsidian'
import Anthropic from '@anthropic-ai/sdk'
import { t } from 'src/i18n/ai-runtime/helper'
import type { Message, ResolveEmbedAsBinary, SendRequest } from '.'
import { mergeProviderOptionsWithParameters } from '.'
import { normalizeProviderError } from './errors'
import { DebugLogger } from 'src/utils/DebugLogger'
import {
	arrayBufferToBase64,
	buildReasoningBlockEnd,
	buildReasoningBlockStart,
	getMimeTypeFromFilename,
} from './utils'
import { resolveCurrentTools, toClaudeTools } from 'src/core/agents/loop'
import {
	filterZhipuRequestExtras,
	normalizeZhipuAnthropicBaseURL,
	toDebuggableError,
	truncateLogText,
	type ZhipuAnthropicLoopOptions,
	ZHIPU_ANTHROPIC_API_VERSION,
	ZHIPU_MAX_TOOL_LOOPS,
	ZHIPU_SLOW_REQUEST_THRESHOLD_MS,
} from './zhipuShared'

const formatMsgForAnthropicAPI = async (
	msg: Message,
	resolveEmbedAsBinary: ResolveEmbedAsBinary
): Promise<Anthropic.MessageParam> => {
	if (msg.role === 'tool') {
		const toolUseId = typeof msg.tool_call_id === 'string' ? msg.tool_call_id.trim() : ''
		if (toolUseId) {
			return {
				role: 'user',
				content: [{
					type: 'tool_result',
					tool_use_id: toolUseId,
					content: msg.content,
				}],
			}
		}
		return {
			role: 'user',
			content: [{
				type: 'text',
				text: msg.content,
			}],
		}
	}

	const content: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam)[] = msg.embeds
		? await Promise.all(msg.embeds.map((embed) => formatAnthropicEmbed(embed, resolveEmbedAsBinary)))
		: []

	if (msg.content.trim()) {
		content.push({
			type: 'text',
			text: msg.content,
		})
	}

	return {
		role: msg.role as 'user' | 'assistant',
		content,
	}
}

const extractZhipuAnthropicErrorMessage = (responseJson: unknown, responseText: string): string => {
	if (responseJson && typeof responseJson === 'object') {
		const record = responseJson as {
			error?: { message?: unknown; type?: unknown }
			message?: unknown
			type?: unknown
		}
		if (typeof record.error?.message === 'string' && record.error.message.trim()) {
			return record.error.message
		}
		if (typeof record.message === 'string' && record.message.trim()) {
			return record.message
		}
		if (typeof record.error?.type === 'string' && record.error.type.trim()) {
			return record.error.type
		}
	}
	const trimmed = responseText.trim()
	if (!trimmed) {
		return 'Empty error response'
	}
	return truncateLogText(trimmed, 200)
}

const buildZhipuAnthropicRequestHeaders = (apiKey: string): Record<string, string> => ({
	'Content-Type': 'application/json',
	Accept: 'application/json',
	'x-api-key': apiKey,
	'anthropic-version': ZHIPU_ANTHROPIC_API_VERSION,
})

const buildZhipuAnthropicMessageUrl = (baseURL: string): string =>
	`${normalizeZhipuAnthropicBaseURL(baseURL)}/v1/messages`

const isAnthropicThinkingBlock = (block: Anthropic.ContentBlock): block is Anthropic.ThinkingBlock =>
	block.type === 'thinking'

const isAnthropicTextBlock = (block: Anthropic.ContentBlock): block is Anthropic.TextBlock =>
	block.type === 'text'

const isAnthropicToolUseBlock = (block: Anthropic.ContentBlock): block is Anthropic.ToolUseBlock =>
	block.type === 'tool_use'

const renderAnthropicResponseBlocks = (
	blocks: readonly Anthropic.ContentBlock[],
	requestDurationMs: number
): { outputChunks: string[]; toolUseBlocks: Anthropic.ToolUseBlock[] } => {
	const outputChunks: string[] = []
	const toolUseBlocks: Anthropic.ToolUseBlock[] = []
	const thinkingBlockCount = blocks.filter(isAnthropicThinkingBlock).length
	const thinkingDurationMs = thinkingBlockCount > 0
		? Math.max(1, Math.round(requestDurationMs / thinkingBlockCount))
		: Math.max(1, requestDurationMs)

	for (const block of blocks) {
		if (isAnthropicThinkingBlock(block)) {
			const reasoningStartedAt = Date.now()
			outputChunks.push(buildReasoningBlockStart(reasoningStartedAt))
			outputChunks.push(block.thinking)
			outputChunks.push(buildReasoningBlockEnd(thinkingDurationMs))
			continue
		}
		if (isAnthropicTextBlock(block)) {
			if (block.text) {
				outputChunks.push(block.text)
			}
			continue
		}
		if (isAnthropicToolUseBlock(block)) {
			toolUseBlocks.push(block)
		}
	}

	return { outputChunks, toolUseBlocks }
}

const requestZhipuAnthropicMessage = async (params: {
	apiKey: string
	baseURL: string
	stage: string
	body: Anthropic.MessageCreateParamsNonStreaming
}): Promise<{ message: Anthropic.Message; durationMs: number }> => {
	const url = buildZhipuAnthropicMessageUrl(params.baseURL)
	const bodyText = JSON.stringify({ ...params.body, stream: false })
	const requestSummary = truncateLogText(bodyText)
	const startedAt = Date.now()

	try {
		const response = await requestUrl({
			url,
			method: 'POST',
			body: bodyText,
			throw: false,
			headers: buildZhipuAnthropicRequestHeaders(params.apiKey),
		})
		const durationMs = Date.now() - startedAt
		const responseText = typeof response.text === 'string' ? response.text : ''
		const contentType = response.headers['content-type'] ?? ''

		if (response.status >= 400) {
			const errorMessage = extractZhipuAnthropicErrorMessage(response.json, responseText)
			DebugLogger.error(`[Zhipu][${params.stage}] HTTP 请求失败`, {
				url,
				method: 'POST',
				status: response.status,
				durationMs,
				contentType,
				requestSummary,
				responsePreview: truncateLogText(responseText),
			})
			const error = new Error(`Zhipu Anthropic API error (${response.status}): ${errorMessage}`) as Error & {
				status?: number
			}
			error.status = response.status
			throw error
		}

		const message = response.json as Anthropic.Message
		if (!message || typeof message !== 'object' || !Array.isArray(message.content)) {
			throw new Error('Zhipu Anthropic API returned invalid message payload')
		}

		if (durationMs >= ZHIPU_SLOW_REQUEST_THRESHOLD_MS) {
			DebugLogger.warn(`[Zhipu][${params.stage}] 请求耗时偏高`, {
				url,
				method: 'POST',
				status: response.status,
				durationMs,
				contentType,
				requestSummary,
				stopReason: message.stop_reason,
			})
		} else {
			DebugLogger.info(`[Zhipu][${params.stage}] 请求完成`, {
				url,
				method: 'POST',
				status: response.status,
				durationMs,
				contentType,
				stopReason: message.stop_reason,
			})
		}

		return { message, durationMs }
	} catch (error) {
		const durationMs = Date.now() - startedAt
		DebugLogger.error(`[Zhipu][${params.stage}] 请求抛出异常`, {
			url,
			method: 'POST',
			durationMs,
			requestSummary,
			error: toDebuggableError(error),
		})
		throw error
	}
}

const emitAnthropicResponse = async function* (
	message: Anthropic.Message,
	requestDurationMs: number
): AsyncGenerator<string, void, unknown> {
	const { outputChunks } = renderAnthropicResponseBlocks(message.content, requestDurationMs)
	for (const chunk of outputChunks) {
		yield chunk
	}
}

const formatAnthropicEmbed = async (embed: EmbedCache, resolveEmbedAsBinary: ResolveEmbedAsBinary) => {
	const mimeType = getMimeTypeFromFilename(embed.link)
	const embedBuffer = await resolveEmbedAsBinary(embed)
	const base64Data = arrayBufferToBase64(embedBuffer)
	if (mimeType === 'application/pdf') {
		return {
			type: 'document',
			source: {
				type: 'base64',
				media_type: mimeType,
				data: base64Data,
			},
		} as Anthropic.DocumentBlockParam
	}
	if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mimeType)) {
		return {
			type: 'image',
			source: {
				type: 'base64',
				media_type: mimeType,
				data: base64Data,
			},
		} as Anthropic.ImageBlockParam
	}
	throw new Error(t('Only PNG, JPEG, GIF, WebP, and PDF files are supported.'))
}

export const sendAnthropicRequestFunc = (settings: ZhipuAnthropicLoopOptions): SendRequest =>
	async function* (messages: readonly Message[], controller: AbortController, resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		try {
			const options = mergeProviderOptionsWithParameters(settings)
			const {
				apiKey,
				baseURL,
				model,
				max_tokens,
				enableThinking,
				budget_tokens,
				tools,
				getTools,
				toolExecutor,
				...remains
			} = options
			if (!apiKey) throw new Error(t('API key is required'))
			if (controller.signal.aborted) return

			const [systemMsg, nonSystemMessages] =
				messages[0]?.role === 'system' ? [messages[0], messages.slice(1)] : [null, messages]
			const loopMessages: Anthropic.MessageParam[] = await Promise.all(
				nonSystemMessages.map((msg) => formatMsgForAnthropicAPI(msg, resolveEmbedAsBinary))
			)
			const requestExtras = filterZhipuRequestExtras(remains)
			const hasStaticTools = Array.isArray(tools) && tools.length > 0
			const hasDynamicTools = typeof getTools === 'function'
			const executor = toolExecutor as NonNullable<ZhipuAnthropicLoopOptions['toolExecutor']> | undefined

			const buildRequestBody = (params: {
				messages: Anthropic.MessageParam[]
				toolDefs?: Anthropic.MessageCreateParamsNonStreaming['tools']
			}): Anthropic.MessageCreateParamsNonStreaming => ({
				model,
				max_tokens,
				messages: params.messages,
				...(systemMsg ? { system: systemMsg.content } : {}),
				...(enableThinking ? { thinking: { type: 'enabled', budget_tokens } } : {}),
				...(params.toolDefs && params.toolDefs.length > 0 ? { tools: params.toolDefs } : {}),
				...requestExtras,
			})

			if ((!hasStaticTools && !hasDynamicTools) || !executor) {
				if (controller.signal.aborted) return
				const { message, durationMs } = await requestZhipuAnthropicMessage({
					apiKey,
					baseURL,
					stage: 'chat-anthropic',
					body: buildRequestBody({ messages: loopMessages }),
				})
				for await (const chunk of emitAnthropicResponse(message, durationMs)) {
					yield chunk
				}
				return
			}

			const maxLoops =
				typeof settings.maxToolCallLoops === 'number' && settings.maxToolCallLoops > 0
					? settings.maxToolCallLoops
					: ZHIPU_MAX_TOOL_LOOPS

			for (let loop = 0; loop < maxLoops; loop++) {
				if (controller.signal.aborted) return
				const currentTools = await resolveCurrentTools(tools, getTools)
				const toolDefs = currentTools.length > 0
					? toClaudeTools(currentTools) as Anthropic.MessageCreateParamsNonStreaming['tools']
					: undefined
				if (controller.signal.aborted) return
				const { message, durationMs } = await requestZhipuAnthropicMessage({
					apiKey,
					baseURL,
					stage: 'chat-anthropic-tools',
					body: buildRequestBody({
						messages: loopMessages,
						toolDefs,
					}),
				})

				const { outputChunks, toolUseBlocks } = renderAnthropicResponseBlocks(message.content, durationMs)
				for (const chunk of outputChunks) {
					yield chunk
				}

				if (toolUseBlocks.length === 0 || message.stop_reason !== 'tool_use') {
					return
				}

				loopMessages.push({ role: 'assistant', content: message.content })

				const toolResults = await Promise.all(toolUseBlocks.map(async (toolBlock) => {
					if (controller.signal.aborted) {
						throw new Error('Generation cancelled')
					}
					let resultText: string
					let status: 'completed' | 'failed' = 'completed'
					try {
						const result = await executor.execute(
							{
								id: toolBlock.id,
								name: toolBlock.name,
								arguments: JSON.stringify(toolBlock.input ?? {}),
							},
							currentTools,
							{ abortSignal: controller.signal }
						)
						resultText = result.content
					} catch (error) {
						resultText = `工具调用失败: ${error instanceof Error ? error.message : String(error)}`
						status = 'failed'
						DebugLogger.error(`[Zhipu][chat-anthropic-tools] 工具执行失败: ${toolBlock.name}`, error)
					}

					settings.onToolCallResult?.({
						id: toolBlock.id,
						name: toolBlock.name,
						arguments:
							toolBlock.input && typeof toolBlock.input === 'object' && !Array.isArray(toolBlock.input)
								? toolBlock.input as Record<string, unknown>
								: {},
						result: resultText,
						status,
						timestamp: Date.now(),
					})

					return { toolBlock, resultText, status }
				}))

				const toolResultContents: Anthropic.ToolResultBlockParam[] = []
				for (const { toolBlock, resultText, status } of toolResults) {
					toolResultContents.push({
						type: 'tool_result',
						tool_use_id: toolBlock.id,
						content: resultText,
						...(status === 'failed' ? { is_error: true } : {}),
					})
					yield `{{FF_MCP_TOOL_START}}:${toolBlock.name}:${resultText}{{FF_MCP_TOOL_END}}:`
				}

				loopMessages.push({ role: 'user', content: toolResultContents })

				if (toolResults.length > 0 && toolResults.every(({ status }) => status === 'failed')) {
					DebugLogger.warn('[Zhipu][chat-anthropic-tools] 所有工具调用均失败，提前结束工具循环')
					break
				}
			}

			if (controller.signal.aborted) return
			const { message, durationMs } = await requestZhipuAnthropicMessage({
				apiKey,
				baseURL,
				stage: 'chat-anthropic-final',
				body: buildRequestBody({ messages: loopMessages }),
			})
			for await (const chunk of emitAnthropicResponse(message, durationMs)) {
				yield chunk
			}
		} catch (error) {
			if (controller.signal.aborted) return
			throw normalizeProviderError(error, 'Zhipu anthropic request failed')
		}
	}