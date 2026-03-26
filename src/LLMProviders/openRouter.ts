import OpenAI from 'openai'
import type { BaseOptions, Vendor } from '.'
import {
	type OpenAILoopOptions,
	type OpenAIToolDefinition,
	type ToolNameMapping,
	withToolCallLoopSupport,
} from 'src/core/agents/loop'
import { createOpenRouterSendRequest } from './openRouterRequest'
import {
	isImageGenerationModel,
	normalizeOpenRouterBaseURL,
	type OpenRouterOptions,
	type OpenRouterReasoningEffort,
} from './openRouterShared'

export {
	isImageGenerationModel,
	type OpenRouterOptions,
	type OpenRouterReasoningEffort,
} from './openRouterShared'

const OPENROUTER_HTTP_REFERER = 'https://github.com/ItsDalk-Lane/obsidian-openchat'
const OPENROUTER_X_TITLE = 'obsidian-openchat'

const normalizeToolName = (name: string): string => {
	let normalized = name.replace(/[^a-zA-Z0-9_-]/g, '_')
	if (!/^[A-Za-z]/.test(normalized)) {
		normalized = `tool_${normalized}`
	}
	return normalized.slice(0, 64)
}

const ensureUniqueToolName = (name: string, usedNames: Set<string>): string => {
	if (!usedNames.has(name)) {
		usedNames.add(name)
		return name
	}

	let suffix = 2
	const buildCandidate = (index: number): string => {
		const suffixText = `_${index}`
		const maxBaseLength = Math.max(1, 64 - suffixText.length)
		return `${name.slice(0, maxBaseLength)}${suffixText}`
	}
	let candidate = buildCandidate(suffix)
	while (usedNames.has(candidate)) {
		suffix += 1
		candidate = buildCandidate(suffix)
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

const createOpenRouterToolLoopClient = (allOptions: Record<string, unknown>): OpenAI => {
	const apiKey = typeof allOptions.apiKey === 'string' ? allOptions.apiKey : ''
	const baseURL = typeof allOptions.baseURL === 'string' ? allOptions.baseURL : ''

	return new OpenAI({
		apiKey,
		baseURL: normalizeOpenRouterBaseURL(baseURL),
		dangerouslyAllowBrowser: true,
		defaultHeaders: {
			'HTTP-Referer': OPENROUTER_HTTP_REFERER,
			'X-Title': OPENROUTER_X_TITLE,
		},
	})
}

const createOpenRouterToolLoopPlugins = (
	allOptions: Record<string, unknown>,
): Array<Record<string, unknown>> | undefined => {
	if (allOptions.enableWebSearch !== true) {
		return undefined
	}

	const plugin: Record<string, unknown> = {
		id: 'web',
		enabled: true,
	}
	if (typeof allOptions.webSearchEngine === 'string' && allOptions.webSearchEngine) {
		plugin.engine = allOptions.webSearchEngine
	}
	if (typeof allOptions.webSearchMaxResults === 'number' && allOptions.webSearchMaxResults !== 5) {
		plugin.max_results = allOptions.webSearchMaxResults
	}
	if (typeof allOptions.webSearchPrompt === 'string' && allOptions.webSearchPrompt) {
		plugin.search_prompt = allOptions.webSearchPrompt
	}

	return [plugin]
}

const openRouterLoopOptions: OpenAILoopOptions = {
	createClient: createOpenRouterToolLoopClient,
	transformApiParams: (apiParams, allOptions) => {
		const mapped: Record<string, unknown> = { ...apiParams }
		delete mapped.enableWebSearch
		delete mapped.webSearchEngine
		delete mapped.webSearchMaxResults
		delete mapped.webSearchPrompt
		delete mapped.imageAspectRatio
		delete mapped.imageStream
		delete mapped.imageResponseFormat
		delete mapped.imageSaveAsAttachment
		delete mapped.imageDisplayWidth

		const plugins = createOpenRouterToolLoopPlugins(allOptions)
		if (plugins) {
			mapped.plugins = plugins
		}

		const enableReasoning = allOptions.enableReasoning as boolean | undefined
		const reasoningEffort = (allOptions.reasoningEffort as string) || 'medium'
		return enableReasoning
			? { ...mapped, reasoning: { effort: reasoningEffort } }
			: mapped
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
	},
}

const createOpenRouterSendRequestWithLoopSupport = withToolCallLoopSupport(
	createOpenRouterSendRequest as unknown as (settings: BaseOptions) => ReturnType<typeof createOpenRouterSendRequest>,
	openRouterLoopOptions,
)

const toOpenRouterSettings = (settings: BaseOptions): OpenRouterOptions => ({
	...(openRouterVendor.defaultOptions as OpenRouterOptions),
	...(settings as Partial<OpenRouterOptions>),
})

export const openRouterVendor: Vendor = {
	name: 'OpenRouter',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://openrouter.ai/api/v1/chat/completions',
		model: '',
		enableWebSearch: false,
		webSearchEngine: undefined,
		webSearchMaxResults: 5,
		webSearchPrompt: undefined,
		imageAspectRatio: '1:1',
		imageStream: false,
		imageResponseFormat: 'b64_json',
		imageSaveAsAttachment: true,
		imageDisplayWidth: 400,
		enableReasoning: false,
		reasoningEffort: 'medium' as OpenRouterReasoningEffort,
		parameters: {},
	} as OpenRouterOptions,
	sendRequestFunc: (settings: BaseOptions) => {
		const model = typeof settings.model === 'string' ? settings.model : ''
		// 图片生成模型不支持工具调用，直接走原始请求链路，避免触发 OpenRouter 的 tool use 404。
		if (isImageGenerationModel(model)) {
			return createOpenRouterSendRequest(toOpenRouterSettings(settings))
		}
		return createOpenRouterSendRequestWithLoopSupport(settings)
	},
	models: [],
	websiteToObtainKey: 'https://openrouter.ai',
	capabilities: ['Text Generation', 'Image Vision', 'PDF Vision', 'Web Search', 'Image Generation', 'Reasoning'],
}
