import OpenAI from 'openai'
import {
	REASONING_BLOCK_END_MARKER,
	REASONING_BLOCK_START_MARKER,
} from 'src/LLMProviders/utils'
import { extractReasoningFromDelta, extractTextFromMessageContent } from './openAILoopUtils'
import type { ToolLoopMessage } from './openAILoopShared'

export interface FinalRequestContext {
	client: OpenAI
	model: string
	loopMessages: ToolLoopMessage[]
	controller: AbortController
	apiParamsForFinalRequest: Record<string, unknown>
	enableReasoning: boolean
}

export async function* runFinalNonStreamingRequest(
	context: FinalRequestContext,
): AsyncGenerator<string, void, undefined> {
	const finalCompletion = await context.client.chat.completions.create(
		{
			model: context.model,
			messages: context.loopMessages as OpenAI.ChatCompletionMessageParam[],
			...context.apiParamsForFinalRequest,
		},
		{ signal: context.controller.signal },
	)
	const finalMessage = finalCompletion.choices[0]?.message as unknown as Record<string, unknown> | undefined
	if (!finalMessage) return

	const finalReasoning = extractReasoningFromDelta(finalMessage)
	if (finalReasoning?.displayText && context.enableReasoning) {
		const startMs = Date.now()
		yield `${REASONING_BLOCK_START_MARKER}:${startMs}:`
		yield finalReasoning.displayText
		yield `:${REASONING_BLOCK_END_MARKER}:${Date.now() - startMs}:`
	}

	const finalText = extractTextFromMessageContent(finalMessage.content)
	if (finalText) {
		yield finalText
	}
}

export async function* runFinalStreamingRequest(
	context: FinalRequestContext,
): AsyncGenerator<string, void, undefined> {
	const finalStream = await context.client.chat.completions.create(
		{
			model: context.model,
			messages: context.loopMessages as OpenAI.ChatCompletionMessageParam[],
			stream: true,
			...context.apiParamsForFinalRequest,
		},
		{ signal: context.controller.signal },
	)

	let finalReasoningBuffer = ''
	let finalReasoningStartMs = 0
	let finalReasoningActive = false

	for await (const part of finalStream) {
		const delta = part.choices[0]?.delta as Record<string, unknown> | undefined
		if (!delta) continue

		const reasoningDelta = extractReasoningFromDelta(delta)
		if (reasoningDelta?.displayText && context.enableReasoning) {
			if (!finalReasoningActive) {
				finalReasoningActive = true
				finalReasoningStartMs = Date.now()
				yield `${REASONING_BLOCK_START_MARKER}:${finalReasoningStartMs}:`
			}
			finalReasoningBuffer += reasoningDelta.displayText
			yield reasoningDelta.displayText
			continue
		}

		const text = delta.content as string | undefined
		if (text) {
			if (finalReasoningActive && finalReasoningBuffer.length > 0) {
				yield `:${REASONING_BLOCK_END_MARKER}:${Date.now() - finalReasoningStartMs}:`
				finalReasoningActive = false
				finalReasoningBuffer = ''
			}
			yield text
		}
	}

	if (finalReasoningActive && finalReasoningBuffer.length > 0) {
		yield `:${REASONING_BLOCK_END_MARKER}:${Date.now() - finalReasoningStartMs}:`
	}
}
