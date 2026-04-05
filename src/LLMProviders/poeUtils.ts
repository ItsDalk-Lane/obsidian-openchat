const DEFAULT_POE_BASE_URL = 'https://api.poe.com/v1'
const ZDR_ORGANIZATION_KEYS = new Set<string>()

const buildPoeOrganizationKey = (baseURL: string, apiKey: string): string => {
	return `${normalizePoeBaseURL(baseURL)}::${apiKey}`
}

export const markPoeOrganizationAsZdr = (baseURL: string, apiKey: string): void => {
	if (!apiKey) return
	ZDR_ORGANIZATION_KEYS.add(buildPoeOrganizationKey(baseURL, apiKey))
}

export const isPoeOrganizationKnownZdr = (baseURL: string, apiKey: string): boolean => {
	if (!apiKey) return false
	return ZDR_ORGANIZATION_KEYS.has(buildPoeOrganizationKey(baseURL, apiKey))
}

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

export const shouldRetryWithoutPreviousResponseId = (error: unknown): boolean => {
	const status = resolveErrorStatus(error)
	if (status !== 400) return false
	const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
	return (
		message.includes('previous response cannot be used')
		|| message.includes('previous_response_id')
		|| message.includes('zero data retention')
	)
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

export const poeMapResponsesParams = (params: Record<string, unknown>) => {
	const mapped = { ...params }
	if (typeof mapped.max_tokens === 'number') {
		mapped.max_output_tokens = mapped.max_tokens
		delete mapped.max_tokens
	}
	delete mapped.previous_response_id
	return mapped
}

export const toResponseRole = (role: string): 'user' | 'assistant' | 'system' => {
	if (role === 'assistant' || role === 'system') return role
	return 'user'
}
