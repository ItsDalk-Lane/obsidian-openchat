import type { BaseOptions } from '.'
import { t } from 'src/i18n/ai-runtime/helper'
import { normalizeProviderError } from './errors'
import { DebugLogger } from 'src/utils/DebugLogger'

export type ZhipuThinkingType = 'enabled' | 'disabled' | 'auto'

export const ZHIPU_THINKING_TYPE_OPTIONS: { value: ZhipuThinkingType; label: string; description: string }[] = [
	{ value: 'disabled', label: t('Disabled'), description: t('Disable reasoning and reply directly') },
	{ value: 'enabled', label: t('Enabled'), description: t('Always enable deep reasoning') },
	{ value: 'auto', label: t('Auto'), description: t('Let the model decide whether to use reasoning') },
]

export const DEFAULT_ZHIPU_THINKING_TYPE: ZhipuThinkingType = 'auto'

export interface ZhipuOptions extends BaseOptions {
	enableReasoning: boolean
	thinkingType: ZhipuThinkingType
	/** 启用结构化输出,自动添加 response_format: { type: 'json_object' } */
	enableStructuredOutput?: boolean
}

export const ZHIPU_SLOW_REQUEST_THRESHOLD_MS = 3000

const LEGACY_ZHIPU_ANTHROPIC_BASE_URL_PATTERN = /\/api\/anthropic(?:\/v1(?:\/messages)?)?\/?$/i

export const toDebuggableError = (error: unknown): Record<string, unknown> => {
	const normalized = normalizeProviderError(error, 'Zhipu request failed')
	return {
		name: normalized.name,
		message: normalized.message,
		type: normalized.type,
		status: normalized.status,
		retryable: normalized.retryable,
		isAbort: normalized.isAbort,
		stack: normalized.stack,
	}
}

export const truncateLogText = (value: string, maxLength = 800): string => {
	if (value.length <= maxLength) {
		return value
	}
	return `${value.slice(0, maxLength)}...`
}

export const summarizeRequestBody = (bodyText: string): Record<string, unknown> | string => {
	if (!bodyText.trim()) {
		return ''
	}
	try {
		const parsed = JSON.parse(bodyText) as Record<string, unknown>
		const messages = Array.isArray(parsed.messages) ? parsed.messages : []
		const tools = Array.isArray(parsed.tools) ? parsed.tools : []
		return {
			model: parsed.model,
			stream: parsed.stream,
			messageCount: messages.length,
			messageRoles: messages
				.map((message) =>
					message && typeof message === 'object' && typeof (message as { role?: unknown }).role === 'string'
						? (message as { role: string }).role
						: 'unknown'
				),
			toolsCount: tools.length,
			hasThinking: parsed.thinking !== undefined,
			thinking: parsed.thinking,
			maxTokens: parsed.max_tokens,
		}
	} catch {
		return truncateLogText(bodyText)
	}
}

const getRequestUrl = (input: RequestInfo | URL): string => {
	if (typeof input === 'string') {
		return input
	}
	if (input instanceof URL) {
		return input.toString()
	}
	return input.url
}

export const createZhipuLoggedFetch = (stage: string): typeof globalThis.fetch => {
	return async (input, init) => {
		const startedAt = Date.now()
		const url = getRequestUrl(input)
		const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
		const requestBody = typeof init?.body === 'string'
			? init.body
			: input instanceof Request
				? await input.clone().text().catch(() => '')
				: ''
		const requestSummary = summarizeRequestBody(requestBody)

		try {
			const response = await globalThis.fetch(input, init)
			const durationMs = Date.now() - startedAt
			const contentType = response.headers.get('content-type') ?? ''

			if (!response.ok) {
				const responseText = await response.clone().text().catch(() => '')
				DebugLogger.error(`[Zhipu][${stage}] HTTP 请求失败`, {
					url,
					method,
					status: response.status,
					durationMs,
					contentType,
					requestSummary,
					responsePreview: truncateLogText(responseText),
				})
			} else if (durationMs >= ZHIPU_SLOW_REQUEST_THRESHOLD_MS) {
				DebugLogger.warn(`[Zhipu][${stage}] 请求耗时偏高`, {
					url,
					method,
					status: response.status,
					durationMs,
					contentType,
					requestSummary,
				})
			} else {
				DebugLogger.info(`[Zhipu][${stage}] 请求完成`, {
					url,
					method,
					status: response.status,
					durationMs,
					contentType,
				})
			}

			return response
		} catch (error) {
			const durationMs = Date.now() - startedAt
			DebugLogger.error(`[Zhipu][${stage}] 请求抛出异常`, {
				url,
				method,
				durationMs,
				requestSummary,
				error: toDebuggableError(error),
			})
			throw error
		}
	}
}

export const buildZhipuThinkingConfig = (options: Pick<ZhipuOptions, 'enableReasoning' | 'thinkingType'>) => {
	if (options.enableReasoning && options.thinkingType !== 'disabled') {
		return {
			type: options.thinkingType,
		}
	}
	return {
		type: 'disabled',
	}
}

export const normalizeZhipuOpenAIBaseURL = (baseURL: string): string => {
	const trimmedBaseURL = baseURL.trim()
	if (!trimmedBaseURL) {
		return trimmedBaseURL
	}

	return trimmedBaseURL.replace(
		LEGACY_ZHIPU_ANTHROPIC_BASE_URL_PATTERN,
		'/api/paas/v4/'
	)
}

const ZHIPU_INTERNAL_OPTION_KEYS = new Set([
	'apiKey',
	'baseURL',
	'model',
	'parameters',
	'enableReasoning',
	'thinkingType',
	'enableThinking',
	'budget_tokens',
	'contextLength',
	'tools',
	'toolExecutor',
	'maxToolCallLoops',
	'getTools',
	'onToolCallResult',
	'mcpTools',
	'mcpGetTools',
	'mcpCallTool',
	'mcpMaxToolCallLoops',
	// response_format 不在内部选项中,需要透传到 API 请求
])

export const filterZhipuRequestExtras = (options: Record<string, unknown>): Record<string, unknown> => {
	const requestExtras: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(options)) {
		if (ZHIPU_INTERNAL_OPTION_KEYS.has(key)) continue
		if (value === undefined || value === null) continue
		if (typeof value === 'function') continue
		requestExtras[key] = value
	}
	return requestExtras
}