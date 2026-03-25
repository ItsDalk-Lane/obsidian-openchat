const DEFAULT_POE_BASE_URL = 'https://api.poe.com/v1'

export const isReasoningDeltaEvent = (eventType: string): boolean => {
	return eventType.includes('reasoning') && eventType.includes('delta')
}

export const resolveErrorStatus = (error: unknown): number | undefined => {
	if (!error || typeof error !== 'object') return undefined
	const err = error as {
		status?: unknown
		statusCode?: unknown
		response?: { status?: unknown }
		message?: unknown
	}
	const candidate = [err.status, err.statusCode, err.response?.status].find(
		(value) => typeof value === 'number'
	)
	if (typeof candidate === 'number') return candidate
	const message = typeof err.message === 'string' ? err.message : ''
	const matched = message.match(/\b(4\d\d|5\d\d)\b/)
	if (!matched) return undefined
	const parsed = Number.parseInt(matched[1], 10)
	return Number.isFinite(parsed) ? parsed : undefined
}

export const shouldFallbackToChatCompletions = (error: unknown): boolean => {
	const status = resolveErrorStatus(error)
	const message = (error instanceof Error ? error.message : String(error)).toLowerCase()

	if (status === 404 || status === 405 || status === 422) return true

	if (status === undefined && /connection\s*error/i.test(message)) return true

	return (
		/(responses?).*(unsupported|not support|not found|invalid)/i.test(message)
		|| /(unsupported|not support|unknown).*(responses?)/i.test(message)
	)
}

export const shouldRetryContinuationWithoutReasoning = (error: unknown): boolean => {
	const status = resolveErrorStatus(error)
	const message = (error instanceof Error ? error.message : String(error)).toLowerCase()

	if (status === 429) return false

	if (
		status === 400
		|| status === 404
		|| status === 405
		|| status === 422
		|| (typeof status === 'number' && status >= 500)
	) {
		return true
	}

	if (
		/(reasoning|thinking)/i.test(message)
		&& /(unsupported|not support|invalid|not allowed|unknown|unrecognized|bad request)/i.test(message)
	) {
		return true
	}

	return /connection\s*error|err_connection_closed|socket|stream|network/i.test(message)
}

export const normalizeErrorText = (prefix: string, error: unknown): Error => {
	const message = error instanceof Error ? error.message : String(error)
	return new Error(`${prefix}: ${message}`)
}

export const normalizePoeBaseURL = (baseURL: string) => {
	const trimmed = (baseURL || '').trim().replace(/\/+$/, '')
	if (!trimmed) return DEFAULT_POE_BASE_URL
	if (trimmed.endsWith('/chat/completions')) {
		return trimmed.replace(/\/chat\/completions$/, '')
	}
	if (trimmed.endsWith('/responses')) {
		return trimmed.replace(/\/responses$/, '')
	}
	return trimmed
}

export const ensureResponseEndpoint = (baseURL: string) => {
	return `${normalizePoeBaseURL(baseURL)}/responses`
}

export const ensureCompletionEndpoint = (baseURL: string) => {
	return `${normalizePoeBaseURL(baseURL)}/chat/completions`
}

export const poeMapResponsesParams = (params: Record<string, unknown>) => {
	const mapped = { ...params }
	if (typeof mapped.max_tokens === 'number') {
		mapped.max_output_tokens = mapped.max_tokens
		delete mapped.max_tokens
	}
	return mapped
}

export const mapResponsesParamsToChatParams = (
	params: Record<string, unknown>
): Record<string, unknown> => {
	const mapped: Record<string, unknown> = { ...params }
	if (typeof mapped.max_output_tokens === 'number' && typeof mapped.max_tokens !== 'number') {
		mapped.max_tokens = mapped.max_output_tokens
	}

	delete mapped.max_output_tokens

	if (mapped.reasoning && typeof mapped.reasoning === 'object') {
		const effort = (mapped.reasoning as Record<string, unknown>).effort
		if (typeof effort === 'string' && effort) {
			mapped.reasoning_effort = effort
		}
	}
	delete mapped.reasoning
	delete mapped.tools
	delete mapped.tool_choice
	delete mapped.parallel_tool_calls
	delete mapped.previous_response_id
	delete mapped.input
	delete mapped.text
	delete mapped.truncation
	delete mapped.include

	return mapped
}

export const toResponseRole = (role: string): 'user' | 'assistant' | 'system' => {
	if (role === 'assistant' || role === 'system') return role
	return 'user'
}
