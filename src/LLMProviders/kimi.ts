import axios from 'axios'
import OpenAI from 'openai'
import { t } from 'src/i18n/ai-runtime/helper'
import { BaseOptions, mergeProviderOptionsWithParameters, Message, ResolveEmbedAsBinary, SendRequest, Vendor } from '.'
import { buildReasoningBlockStart, buildReasoningBlockEnd, convertEmbedToImageUrl } from './utils'
import { feedChunk, ParsedSSEEvent } from './sse'
import { OpenAILoopOptions, OpenAIToolDefinition, ToolNameMapping, withToolCallLoopSupport } from 'src/core/agents/loop'
import { DebugLogger } from 'src/utils/DebugLogger'

// Kimi选项接口，扩展基础选项以支持推理功能
export interface KimiOptions extends BaseOptions {
	// 推理功能配置
	enableReasoning?: boolean // 是否启用推理功能
}

type KimiSSEPayload = {
	choices?: Array<{
		delta?: {
			reasoning_content?: string
			content?: string
		}
	}>
}

const normalizeToolName = (name: string): string => {
	let normalized = name.replace(/[^a-zA-Z0-9_-]/g, '_')
	if (!/^[A-Za-z]/.test(normalized)) {
		normalized = `tool_${normalized}`
	}
	return normalized
}

const ensureUniqueToolName = (name: string, usedNames: Set<string>): string => {
	if (!usedNames.has(name)) {
		usedNames.add(name)
		return name
	}

	let suffix = 2
	let candidate = `${name}_${suffix}`
	while (usedNames.has(candidate)) {
		suffix += 1
		candidate = `${name}_${suffix}`
	}
	usedNames.add(candidate)
	return candidate
}

const sanitizeToolSchema = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value.map((item) => sanitizeToolSchema(item))
	}
	if (!value || typeof value !== 'object') {
		return value
	}
	const record = value as Record<string, unknown>
	const next: Record<string, unknown> = {}
	for (const [key, child] of Object.entries(record)) {
		next[key] = sanitizeToolSchema(child)
	}
	if (next.exclusiveMinimum === true && typeof next.minimum === 'number') {
		next.exclusiveMinimum = next.minimum
		delete next.minimum
	}
	if (next.exclusiveMaximum === true && typeof next.maximum === 'number') {
		next.exclusiveMaximum = next.maximum
		delete next.maximum
	}
	return next
}

const kimiLoopOptions: OpenAILoopOptions = {
	createClient: (allOptions: Record<string, unknown>) => {
		const apiKey = typeof allOptions.apiKey === 'string' ? allOptions.apiKey : ''
		let baseURL = typeof allOptions.baseURL === 'string' ? allOptions.baseURL : ''
		if (baseURL.endsWith('/chat/completions')) {
			baseURL = baseURL.replace(/\/chat\/completions$/, '')
		}
		const cleanFetch: typeof globalThis.fetch = (input, init) => {
			if (init?.headers) {
				const headersInit = init.headers as HeadersInit
				const cleanedHeaders: Record<string, string> = {}
				if (headersInit instanceof Headers) {
					headersInit.forEach((value, key) => {
						cleanedHeaders[key] = value
					})
				} else if (Array.isArray(headersInit)) {
					for (const [key, value] of headersInit) {
						cleanedHeaders[key] = String(value)
					}
				} else {
					Object.assign(cleanedHeaders, headersInit)
				}
				for (const key of Object.keys(cleanedHeaders)) {
					if (key.startsWith('x-stainless-')) {
						delete cleanedHeaders[key]
					}
				}
				if ('user-agent' in cleanedHeaders) {
					cleanedHeaders['user-agent'] = 'OpenChat/1.0'
				}
				return globalThis.fetch(input, { ...init, headers: cleanedHeaders })
			}
			return globalThis.fetch(input, init)
		}
		return new OpenAI({
			apiKey,
			baseURL,
			dangerouslyAllowBrowser: true,
			fetch: cleanFetch,
		})
	},
	transformApiParams: (apiParams, allOptions) => {
		const mapped: Record<string, unknown> = { ...apiParams }
		delete mapped.enableThinking
		delete mapped.enableWebSearch
		if (mapped.tool_choice === undefined) {
			mapped.tool_choice = 'auto'
		}
		const isReasoningEnabled = allOptions.enableReasoning === true
		if (isReasoningEnabled) {
			mapped.temperature = 1.0
		}
		const hasMcpTools = Array.isArray(allOptions.mcpTools) && allOptions.mcpTools.length > 0
		const currentMaxTokens = typeof mapped.max_tokens === 'number' ? mapped.max_tokens : undefined
		if (hasMcpTools && isReasoningEnabled && (currentMaxTokens === undefined || currentMaxTokens < 16000)) {
			mapped.max_tokens = 16000
		}
		return mapped
	},
	transformTools: (tools: OpenAIToolDefinition[]): { tools: OpenAIToolDefinition[]; mapping: ToolNameMapping } => {
		const mapping: ToolNameMapping = { normalizedToOriginal: new Map() }
		const usedNames = new Set<string>()
		const transformedTools = tools.map((tool) => {
			const normalizedName = ensureUniqueToolName(normalizeToolName(tool.function.name), usedNames)
			mapping.normalizedToOriginal.set(normalizedName, tool.function.name)
			return {
				...tool,
				function: {
					...tool.function,
					name: normalizedName,
					parameters: sanitizeToolSchema(tool.function.parameters) as Record<string, unknown>,
				},
			}
		})
		return { tools: transformedTools, mapping }
	}
}

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (messages: readonly Message[], controller: AbortController, resolveEmbedAsBinary: ResolveEmbedAsBinary) {
		const options = mergeProviderOptionsWithParameters(settings)
		const { apiKey, baseURL, model, ...remains } = options
		if (!apiKey) throw new Error(t('API key is required'))
		if (!model) throw new Error(t('Model is required'))

		const formattedMessages = await Promise.all(messages.map((msg) => formatMsg(msg, resolveEmbedAsBinary)))
		const data = {
			model,
			messages: formattedMessages,
			stream: true,
			...remains
		}
		const response = await axios.post(baseURL, data, {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			adapter: 'fetch',
			responseType: 'stream',
			withCredentials: false,
			signal: controller.signal
		})

		const reader = response.data.pipeThrough(new TextDecoderStream()).getReader()

		let reading = true
		let sseRest = ''
		let startReasoning = false
		let reasoningStartMs: number | null = null
		const kimiOptions = settings as KimiOptions
		const isReasoningEnabled = kimiOptions.enableReasoning ?? false

		const processEvents = async function* (events: ParsedSSEEvent[]) {
			for (const event of events) {
				if (event.isDone) {
					reading = false
					break
				}
				if (event.parseError) {
					DebugLogger.warn('[Kimi] Failed to parse SSE JSON:', event.parseError)
				}
				const payload = event.json as KimiSSEPayload | undefined
				if (!payload || !payload.choices || !payload.choices[0]?.delta) {
					continue
				}
				const delta = payload.choices[0].delta
				const reasonContent = delta.reasoning_content

				if (reasonContent && isReasoningEnabled) {
					if (!startReasoning) {
						startReasoning = true
						reasoningStartMs = Date.now()
						yield buildReasoningBlockStart(reasoningStartMs)
					}
					yield reasonContent
				} else {
					if (startReasoning) {
						startReasoning = false
						const durationMs = Date.now() - (reasoningStartMs ?? Date.now())
						reasoningStartMs = null
						yield buildReasoningBlockEnd(durationMs)
					}
					if (delta.content) {
						yield delta.content
					}
				}
			}
		}
		
		while (reading) {
			const { done, value } = await reader.read()
			if (done) {
				const flushed = feedChunk(sseRest, '\n\n')
				sseRest = flushed.rest
				for await (const text of processEvents(flushed.events)) {
					yield text
				}
				reading = false
				break
			}
			const parsed = feedChunk(sseRest, value)
			sseRest = parsed.rest
			for await (const text of processEvents(parsed.events)) {
				yield text
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

	// If there are no embeds/images, return a simple text message format
	if (content.length === 0) {
		return {
			role: msg.role,
			content: msg.content
		}
	}
	if (msg.content.trim()) {
		content.push({
			type: 'text' as const,
			text: msg.content
		})
	}
	return {
		role: msg.role,
		content
	}
}

export const kimiVendor: Vendor = {
	name: 'Kimi',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://api.moonshot.cn/v1/chat/completions',
		model: '',
		parameters: {},
		enableReasoning: false
	} as KimiOptions,
	sendRequestFunc: withToolCallLoopSupport(sendRequestFunc, kimiLoopOptions),

	models: [],
	websiteToObtainKey: 'https://www.moonshot.cn',
	capabilities: ['Text Generation', 'Image Vision', 'Reasoning']
}
