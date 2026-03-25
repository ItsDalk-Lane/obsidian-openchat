import { Platform } from 'obsidian'
import OpenAI from 'openai'

import type { PoeRequestContext } from './poeRunnerShared'

import {
	requestChatCompletionByRequestUrl,
	requestChatCompletionStreamByFetch
} from './poeRequests'
import { formatMsg, extractMessageText } from './poeMessageTransforms'
import { ensureCompletionEndpoint } from './poeUtils'
import { withRetry } from './retry'
import { feedChunk } from './sse'
import { buildReasoningBlockEnd, buildReasoningBlockStart } from './utils'

type PoeChatDelta = OpenAI.ChatCompletionChunk.Choice.Delta & {
	reasoning_content?: string
	tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>
}

type PoeChatPayload = {
	choices?: Array<{
		delta?: PoeChatDelta
	}>
}

type PoeFallbackMessage = {
	reasoning_content?: unknown
	content?: unknown
}

export const runChatCompletionFallback = async function* (context: PoeRequestContext) {
	const formattedMessages = await Promise.all(
		context.messages.map((msg) => formatMsg(msg, context.resolveEmbedAsBinary))
	)
	try {
		const stream = await context.client.chat.completions.create(
			{
				model: context.model,
				messages: formattedMessages as OpenAI.ChatCompletionMessageParam[],
				stream: true,
				...context.chatFallbackParams
			},
			{ signal: context.controller.signal }
		)

		let reasoningActive = false
		let reasoningStartMs: number | null = null

		for await (const part of stream) {
			const delta = part.choices[0]?.delta as PoeChatDelta | undefined
			const reasoningText = delta?.reasoning_content
			if (reasoningText && context.enableReasoning) {
				if (!reasoningActive) {
					reasoningActive = true
					reasoningStartMs = Date.now()
					yield buildReasoningBlockStart(reasoningStartMs)
				}
				yield reasoningText
			}

			const text = delta?.content
			if (text) {
				if (reasoningActive) {
					const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
					yield buildReasoningBlockEnd(durationMs)
					reasoningActive = false
					reasoningStartMs = null
				}
				yield text
			}
		}

		if (reasoningActive) {
			const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
			yield buildReasoningBlockEnd(durationMs)
		}
		return
	} catch (sdkStreamError) {
		if (!Platform.isDesktopApp) throw sdkStreamError
	}

	const response = await withRetry(
		() =>
			requestChatCompletionByRequestUrl(
				ensureCompletionEndpoint(context.baseURL),
				context.apiKey,
				{
					model: context.model,
					messages: formattedMessages,
					...context.chatFallbackParams
				}
			),
		{
			...context.retryOptions,
			signal: context.controller.signal
		}
	)
	const parsedResponse = response as { choices?: Array<{ message?: PoeFallbackMessage }> }
	const firstChoice = parsedResponse.choices?.[0]
	const message = (firstChoice?.message ?? {}) as PoeFallbackMessage

	if (context.enableReasoning) {
		const reasoningContent = message.reasoning_content
		if (typeof reasoningContent === 'string' && reasoningContent.trim()) {
			const startMs = Date.now()
			yield buildReasoningBlockStart(startMs)
			yield reasoningContent
			const durationMs = Math.max(10, Date.now() - startMs)
			yield buildReasoningBlockEnd(durationMs)
		}
	}

	const text = extractMessageText(message.content)
	if (text) yield text
}

export const runStreamingChatCompletion = async function* (context: PoeRequestContext) {
	const formattedMessages = await Promise.all(
		context.messages.map((msg) => formatMsg(msg, context.resolveEmbedAsBinary))
	)
	const stream = await context.client.chat.completions.create(
		{
			model: context.model,
			messages: formattedMessages as OpenAI.ChatCompletionMessageParam[],
			stream: true,
			...context.chatFallbackParams
		},
		{ signal: context.controller.signal }
	)

	let reasoningActive = false
	let reasoningStartMs: number | null = null

	for await (const part of stream) {
		const delta = part.choices[0]?.delta as PoeChatDelta | undefined
		const reasoningText = delta?.reasoning_content
		if (reasoningText && context.enableReasoning) {
			if (!reasoningActive) {
				reasoningActive = true
				reasoningStartMs = Date.now()
				yield buildReasoningBlockStart(reasoningStartMs)
			}
			yield reasoningText
		}

		const text = delta?.content
		if (text) {
			if (reasoningActive) {
				const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
				yield buildReasoningBlockEnd(durationMs)
				reasoningActive = false
				reasoningStartMs = null
			}
			yield text
		}
	}

	if (reasoningActive) {
		const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
		yield buildReasoningBlockEnd(durationMs)
	}
}

export const runStreamingChatCompletionByFetch = async function* (
	context: PoeRequestContext
) {
	const formattedMessages = await Promise.all(
		context.messages.map((msg) => formatMsg(msg, context.resolveEmbedAsBinary))
	)
	const reader = await requestChatCompletionStreamByFetch(
		ensureCompletionEndpoint(context.baseURL),
		context.apiKey,
		{
			model: context.model,
			messages: formattedMessages,
			...context.chatFallbackParams
		},
		context.controller.signal
	)

	let sseRest = ''
	let reading = true
	let reasoningActive = false
	let reasoningStartMs: number | null = null

	const processChatDelta = function* (delta: PoeChatDelta | undefined) {
		if (!delta) return

		const reasoningText = delta.reasoning_content
		if (reasoningText && context.enableReasoning) {
			if (!reasoningActive) {
				reasoningActive = true
				reasoningStartMs = Date.now()
				yield buildReasoningBlockStart(reasoningStartMs)
			}
			yield String(reasoningText)
		}

		const text = delta.content
		if (typeof text === 'string' && text) {
			if (reasoningActive) {
				const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
				yield buildReasoningBlockEnd(durationMs)
				reasoningActive = false
				reasoningStartMs = null
			}
			yield text
		}
	}

	while (reading) {
		const { done, value } = await reader.read()
		const parsed = feedChunk(sseRest, done ? '\n\n' : value ?? '')
		sseRest = parsed.rest

		for (const event of parsed.events) {
			if (event.isDone) {
				reading = false
				break
			}
			const payload = event.json as PoeChatPayload | undefined
			const delta = payload?.choices?.[0]?.delta
			yield* processChatDelta(delta)
		}

		if (done) {
			reading = false
		}
	}

	if (reasoningActive) {
		const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
		yield buildReasoningBlockEnd(durationMs)
	}
}