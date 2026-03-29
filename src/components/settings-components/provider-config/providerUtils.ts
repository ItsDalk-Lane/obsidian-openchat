import { requestUrl } from 'obsidian'
import { claudeVendor } from 'src/LLMProviders/claude'
import { deepSeekVendor } from 'src/LLMProviders/deepSeek'
import { doubaoVendor } from 'src/LLMProviders/doubao'
import { grokVendor } from 'src/LLMProviders/grok'
import { kimiVendor } from 'src/LLMProviders/kimi'
import { openRouterVendor } from 'src/LLMProviders/openRouter'
import { poeVendor } from 'src/LLMProviders/poe'
import {
	normalizeOllamaBaseURL,
	normalizeProviderBaseURLForRuntime,
} from 'src/LLMProviders/provider-base-url'
import { qianFanNormalizeBaseURL, qianFanVendor } from 'src/LLMProviders/qianFan'
import { qwenVendor } from 'src/LLMProviders/qwen'
import { siliconFlowVendor } from 'src/LLMProviders/siliconflow'
import { normalizeZhipuOpenAIBaseURL, zhipuVendor } from 'src/LLMProviders/zhipu'
import type { BaseOptions } from 'src/types/provider'

export const isValidUrl = (url: string) => {
	try {
		new URL(url)
		return true
	} catch {
		return false
	}
}

type ModelFetchOptions = BaseOptions & { apiSecret?: string }
type ModelFetchRequest = {
	url: string
	method?: 'GET' | 'POST'
	headers?: Record<string, string>
	body?: string
}
type ParsedModelList = {
	models: string[]
	rawModelById?: Record<string, unknown>
}
export type ModelFetchConfig = {
	requiresApiKey: boolean
	requiresApiSecret?: boolean
	fallbackModels: string[]
	buildRequest: (options: ModelFetchOptions) => Promise<ModelFetchRequest> | ModelFetchRequest
	parseResponse?: (result: unknown) => string[] | ParsedModelList
	sortModels?: (models: string[]) => string[]
}
type FetchModelsResult = {
	models: string[]
	usedFallback: boolean
	fallbackReason?: string
	rawModelById?: Record<string, unknown>
}

const sanitizeModelList = (models: unknown[]): string[] =>
	Array.from(
		new Set(
			models
				.map((model) => (typeof model === 'string' ? model.trim() : ''))
				.filter((model) => model.length > 0)
		)
	)

const parseModelDate = (model: string): number | null => {
	const matches = [...model.matchAll(/(?:^|[-_])(\d{8}|\d{6})(?=$|[^0-9])/g)]
	if (matches.length === 0) return null
	const value = matches[matches.length - 1][1]
	if (value.length === 8) {
		const year = Number(value.slice(0, 4))
		const month = Number(value.slice(4, 6))
		const day = Number(value.slice(6, 8))
		if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return null
		return Number(value)
	}
	const month = Number(value.slice(2, 4))
	const day = Number(value.slice(4, 6))
	if (month < 1 || month > 12 || day < 1 || day > 31) return null
	return Number(`${2000 + Number(value.slice(0, 2))}${value.slice(2)}`)
}

const sortModelsByDateDesc = (models: string[]): string[] =>
	[...models]
		.map((model, index) => ({ model, index, date: parseModelDate(model) }))
		.sort((a, b) => {
			if (a.date === null && b.date === null) return a.index - b.index
			if (a.date === null) return 1
			if (b.date === null) return -1
			if (a.date !== b.date) return b.date - a.date
			return a.index - b.index
		})
		.map((item) => item.model)

const toParsedModelList = (models: unknown[]): ParsedModelList => {
	const pairs = models.flatMap((rawModel) => {
		if (typeof rawModel === 'string') {
			const id = rawModel.trim()
			return id ? [{ id, rawModel: { id } }] : []
		}
		if (!rawModel || typeof rawModel !== 'object') return []
		const record = rawModel as Record<string, unknown>
		const id =
			typeof record.id === 'string'
				? record.id.trim()
				: typeof record.name === 'string'
					? record.name.trim()
					: ''
		return id ? [{ id, rawModel }] : []
	})
	const rawModelById: Record<string, unknown> = {}
	for (const pair of pairs) {
		rawModelById[pair.id] = pair.rawModel
	}
	return { models: sanitizeModelList(pairs.map((pair) => pair.id)), rawModelById }
}

const parseOpenAICompatibleModels = (result: unknown): ParsedModelList => {
	const data = result && typeof result === 'object' && Array.isArray((result as { data?: unknown }).data)
		? (result as { data: unknown[] }).data
		: []
	return toParsedModelList(data)
}

const parseGenericModels = (result: unknown): ParsedModelList => {
	const openAICompatible = parseOpenAICompatibleModels(result)
	if (openAICompatible.models.length > 0) return openAICompatible
	const models = result && typeof result === 'object' && Array.isArray((result as { models?: unknown }).models)
		? (result as { models: unknown[] }).models
		: []
	return toParsedModelList(models)
}

const parseAnthropicModels = (result: unknown): ParsedModelList =>
	parseOpenAICompatibleModels(result)

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')
const appendPath = (baseURL: string | undefined, path: string, fallbackURL: string) => {
	const trimmed = (baseURL || '').trim()
	return trimmed ? `${trimTrailingSlash(trimmed)}${path}` : fallbackURL
}
const resolveOrigin = (baseURL: string | undefined, fallbackOrigin: string) => {
	try {
		return new URL((baseURL || '').trim()).origin
	} catch {
		return fallbackOrigin
	}
}
const resolvePoeModelListURL = (baseURL: string | undefined) => {
	const trimmed = (baseURL || '').trim()
	if (!trimmed) return 'https://api.poe.com/v1/models'
	return `${trimTrailingSlash(trimmed).replace(/\/chat\/completions$/i, '').replace(/\/responses$/i, '')}/models`
}

const fetchModels = async (
	config: ModelFetchConfig,
	options: ModelFetchOptions
): Promise<FetchModelsResult> => {
	try {
		const request = await config.buildRequest(options)
		const response = await requestUrl({
			url: request.url,
			method: request.method || 'GET',
			body: request.body,
			headers: { 'Content-Type': 'application/json', ...(request.headers || {}) }
		})
		if (response.status >= 400) {
			throw new Error(`Model request failed (${response.status})`)
		}
		const parser = config.parseResponse ?? parseGenericModels
		const parsed = parser(response.json)
		const parsedModels = Array.isArray(parsed) ? sanitizeModelList(parsed) : sanitizeModelList(parsed.models)
		const rawModelById = Array.isArray(parsed) ? undefined : parsed.rawModelById
		const models = config.sortModels ? config.sortModels(parsedModels) : parsedModels
		if (models.length > 0) return { models, usedFallback: false, rawModelById }
		throw new Error('Model response did not include valid model IDs')
	} catch (error) {
		const fallbackModels = config.sortModels
			? config.sortModels(sanitizeModelList(config.fallbackModels))
			: sanitizeModelList(config.fallbackModels)
		if (fallbackModels.length === 0) throw error
		return {
			models: fallbackModels,
			usedFallback: true,
			fallbackReason: error instanceof Error ? error.message : String(error)
		}
	}
}

export const fetchOllamaLocalModels = async (baseURL?: string): Promise<string[]> => {
	const response = await requestUrl({ url: `${normalizeOllamaBaseURL(baseURL)}/api/tags` })
	const models = Array.isArray(response.json?.models) ? response.json.models : []
	return models.map((model: { name: string }) => model.name).filter(Boolean)
}

export { normalizeProviderBaseURLForRuntime }

export const MODEL_FETCH_CONFIGS: Record<string, ModelFetchConfig> = {
	[siliconFlowVendor.name]: {
		requiresApiKey: true,
		fallbackModels: [...siliconFlowVendor.models],
		buildRequest: (options) => ({
			url: `${appendPath(options.baseURL, '/models', 'https://api.siliconflow.cn/v1/models')}?type=text&sub_type=chat`,
			headers: { Authorization: `Bearer ${options.apiKey}` }
		}),
		parseResponse: parseOpenAICompatibleModels
	},
	[openRouterVendor.name]: {
		requiresApiKey: false,
		fallbackModels: [...openRouterVendor.models],
		buildRequest: () => ({ url: 'https://openrouter.ai/api/v1/models' }),
		parseResponse: parseOpenAICompatibleModels
	},
	[poeVendor.name]: {
		requiresApiKey: true,
		fallbackModels: [...poeVendor.models],
		buildRequest: (options) => ({
			url: resolvePoeModelListURL(options.baseURL),
			headers: { Authorization: `Bearer ${options.apiKey}` }
		}),
		parseResponse: parseGenericModels
	},
	[kimiVendor.name]: {
		requiresApiKey: true,
		fallbackModels: [...kimiVendor.models],
		buildRequest: (options) => ({
			url: `${resolveOrigin(options.baseURL, 'https://api.moonshot.cn')}/v1/models`,
			headers: { Authorization: `Bearer ${options.apiKey}` }
		}),
		parseResponse: parseOpenAICompatibleModels
	},
	[grokVendor.name]: {
		requiresApiKey: true,
		fallbackModels: [...grokVendor.models],
		buildRequest: () => ({ url: 'https://api.x.ai/v1/models' }),
		parseResponse: parseOpenAICompatibleModels
	},
	[claudeVendor.name]: {
		requiresApiKey: true,
		fallbackModels: [...claudeVendor.models],
		buildRequest: (options) => ({
			url: `${resolveOrigin(options.baseURL, 'https://api.anthropic.com')}/v1/models`,
			headers: { 'x-api-key': options.apiKey, 'anthropic-version': '2023-06-01' }
		}),
		parseResponse: parseAnthropicModels
	},
	[qwenVendor.name]: {
		requiresApiKey: true,
		fallbackModels: [...qwenVendor.models],
		buildRequest: (options) => ({
			url: appendPath(options.baseURL, '/models', 'https://dashscope.aliyuncs.com/compatible-mode/v1/models'),
			headers: { Authorization: `Bearer ${options.apiKey}` }
		}),
		parseResponse: parseOpenAICompatibleModels
	},
	[zhipuVendor.name]: {
		requiresApiKey: true,
		fallbackModels: [...zhipuVendor.models],
		buildRequest: (options) => ({
			url: appendPath(
				normalizeZhipuOpenAIBaseURL(String(options.baseURL ?? '')),
				'/models',
				'https://open.bigmodel.cn/api/paas/v4/models'
			),
			headers: { Authorization: `Bearer ${options.apiKey}` } as Record<string, string>
		}),
		parseResponse: parseOpenAICompatibleModels
	},
	[deepSeekVendor.name]: {
		requiresApiKey: true,
		fallbackModels: [...deepSeekVendor.models],
		buildRequest: (options) => ({
			url: appendPath(options.baseURL, '/models', 'https://api.deepseek.com/models'),
			headers: { Authorization: `Bearer ${options.apiKey}` }
		}),
		parseResponse: parseOpenAICompatibleModels
	},
	[qianFanVendor.name]: {
		requiresApiKey: true,
		fallbackModels: [...qianFanVendor.models],
		buildRequest: (options) => ({
			url: `${qianFanNormalizeBaseURL(options.baseURL)}/models`,
			headers: { Authorization: `Bearer ${options.apiKey}` }
		}),
		parseResponse: parseGenericModels
	},
	[doubaoVendor.name]: {
		requiresApiKey: true,
		fallbackModels: [...doubaoVendor.models],
		buildRequest: (options) => ({
			url: `${resolveOrigin(options.baseURL, 'https://ark.cn-beijing.volces.com')}/api/v3/models`,
			headers: { Authorization: `Bearer ${options.apiKey}` }
		}),
		parseResponse: parseGenericModels,
		sortModels: sortModelsByDateDesc
	}
}

export { fetchModels }
