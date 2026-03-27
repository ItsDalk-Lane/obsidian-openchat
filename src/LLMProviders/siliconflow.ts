import { requestUrl } from 'obsidian'
import OpenAI from 'openai'
import { t } from 'src/i18n/ai-runtime/helper'
import { BaseOptions, mergeProviderOptionsWithParameters, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'
import { buildReasoningBlockStart, buildReasoningBlockEnd, convertEmbedToImageUrl } from './utils'
import { withToolMessageContext } from './messageFormat'
import { withToolCallLoopSupport } from 'src/core/agents/loop'

// SiliconFlow选项接口，扩展基础选项以支持推理功能
export interface SiliconFlowOptions extends BaseOptions {
	// 推理功能配置
	enableReasoning?: boolean // 是否启用推理功能
}

type DeepSeekDelta = OpenAI.ChatCompletionChunk.Choice.Delta & {
	reasoning_content?: string
} // hack, deepseek-reasoner added a reasoning_content field

const getRequestUrlString = (input: RequestInfo | URL): string => {
	if (typeof input === 'string') {
		return input
	}
	if (input instanceof URL) {
		return input.toString()
	}
	return input.url
}

const getRequestMethod = (input: RequestInfo | URL, init?: RequestInit): string => {
	if (init?.method) {
		return init.method
	}
	if (input instanceof Request) {
		return input.method
	}
	return 'GET'
}

const toHeaderRecord = (input: RequestInfo | URL, init?: RequestInit): Record<string, string> => {
	const headers = new Headers(input instanceof Request ? input.headers : undefined)
	if (init?.headers) {
		new Headers(init.headers).forEach((value, key) => {
			headers.set(key, value)
		})
	}

	const headerRecord: Record<string, string> = {}
	headers.forEach((value, key) => {
		headerRecord[key] = value
	})
	return headerRecord
}

const resolveRequestBody = async (input: RequestInfo | URL, init?: RequestInit): Promise<string | ArrayBuffer | undefined> => {
	if (typeof init?.body === 'string' || init?.body instanceof ArrayBuffer) {
		return init.body
	}

	if (init?.body instanceof Uint8Array) {
		const buffer = new Uint8Array(init.body.byteLength)
		buffer.set(init.body)
		return buffer.buffer
	}

	if (input instanceof Request) {
		return await input.clone().text().catch(() => undefined)
	}

	return undefined
}

const buildResponseBody = (response: Awaited<ReturnType<typeof requestUrl>>): BodyInit | null => {
	if (typeof response.text === 'string') {
		return response.text
	}
	if (response.arrayBuffer instanceof ArrayBuffer) {
		return response.arrayBuffer
	}
	if (response.json !== undefined) {
		return JSON.stringify(response.json)
	}
	return null
}

const createAbortError = (): Error => {
	try {
		return new DOMException('The operation was aborted.', 'AbortError')
	} catch {
		const error = new Error('The operation was aborted.')
		error.name = 'AbortError'
		return error
	}
}

const withAbortSupport = async <T>(signal: AbortSignal | null | undefined, task: Promise<T>): Promise<T> => {
	if (!signal) {
		return await task
	}
	if (signal.aborted) {
		throw createAbortError()
	}

	return await new Promise<T>((resolve, reject) => {
		const onAbort = () => {
			reject(createAbortError())
		}

		signal.addEventListener('abort', onAbort, { once: true })
		task.then(
			(value) => {
				signal.removeEventListener('abort', onAbort)
				resolve(value)
			},
			(error) => {
				signal.removeEventListener('abort', onAbort)
				reject(error)
			}
		)
	})
}

const createSiliconFlowDesktopFetch = (): typeof globalThis.fetch => {
	return async (input, init) => {
		const url = getRequestUrlString(input)
		const method = getRequestMethod(input, init)
		const headers = toHeaderRecord(input, init)
		const body = await resolveRequestBody(input, init)
		const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)

		const response = await withAbortSupport(
			signal,
			requestUrl({
				url,
				method,
				headers,
				body,
				throw: false,
			})
		)

		const responseHeaders = new Headers()
		Object.entries(response.headers ?? {}).forEach(([key, value]) => {
			if (Array.isArray(value)) {
				responseHeaders.set(key, value.join(', '))
				return
			}
			if (typeof value === 'string') {
				responseHeaders.set(key, value)
			}
		})

		return new Response(buildResponseBody(response), {
			status: response.status,
			headers: responseHeaders,
		})
	}
}

const siliconFlowDesktopFetch = createSiliconFlowDesktopFetch()

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: readonly Message[], controller: AbortController, resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const options = mergeProviderOptionsWithParameters(settings)
		const { apiKey, baseURL, model, enableReasoning, ...remains } = options as SiliconFlowOptions
		if (!apiKey) throw new Error(t('API key is required'))

		const formattedMessages = await Promise.all(messages.map((msg) => formatMsg(msg, resolveEmbedAsBinary)))
		const client = new OpenAI({
			apiKey,
			baseURL,
			dangerouslyAllowBrowser: true,
			fetch: siliconFlowDesktopFetch
		})

		const stream = await client.chat.completions.create(
			{
				model,
				messages: formattedMessages as OpenAI.ChatCompletionMessageParam[],
				stream: true,
				...remains
			} as OpenAI.ChatCompletionCreateParamsStreaming,
			{ signal: controller.signal }
		)

		let startReasoning = false
		let reasoningStartMs: number | null = null
		const isReasoningEnabled = enableReasoning ?? false
		for await (const part of stream) {
			const delta = part.choices[0]?.delta as DeepSeekDelta
			const reasonContent = delta?.reasoning_content

			if (reasonContent && isReasoningEnabled) {
				if (!startReasoning) {
					startReasoning = true
					reasoningStartMs = Date.now()
					yield buildReasoningBlockStart(reasoningStartMs)
				}
				yield reasonContent // 直接输出，不加任何前缀
			} else {
				if (startReasoning) {
					startReasoning = false
					const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
					reasoningStartMs = null
					yield buildReasoningBlockEnd(durationMs)
				}
				if (delta?.content) yield delta.content
			}
		}

		if (startReasoning) {
			const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
			yield buildReasoningBlockEnd(durationMs)
		}
	}

type ContentItem =
	| {
		type: 'image_url'
		image_url: {
			url: string
		}
	}
	| { type: 'text'; text: string }

const formatMsg = async (msg: Message, resolveEmbedAsBinary: ResolveEmbedAsBinary) => {
	const content: ContentItem[] = msg.embeds
		? await Promise.all(msg.embeds.map((embed) => convertEmbedToImageUrl(embed, resolveEmbedAsBinary)))
		: []

	if (msg.content.trim()) {
		content.push({
			type: 'text' as const,
			text: msg.content
		})
	}
	return withToolMessageContext(msg, {
		role: msg.role,
		content
	})
}

export const siliconFlowVendor: Vendor = {
	name: 'SiliconFlow',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.siliconflow.cn/v1',
		model: '',
		parameters: {},
		enableReasoning: false
	} as SiliconFlowOptions,
	sendRequestFunc: withToolCallLoopSupport(sendRequestFunc as (settings: BaseOptions) => SendRequest),
	models: [],
	websiteToObtainKey: 'https://siliconflow.cn',
	capabilities: ['Text Generation', 'Image Vision', 'PDF Vision', 'Reasoning']
}
