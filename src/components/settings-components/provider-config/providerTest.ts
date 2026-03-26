import OpenAI from 'openai'
import { Notice } from 'obsidian'
import { normalizeProviderBaseURLForRuntime } from 'src/components/settings-components/provider-config/providerUtils'
import { t } from 'src/i18n/ai-runtime/helper'
import { buildZhipuThinkingConfig, createZhipuLoggedFetch, isZhipuAnthropicBaseURL } from 'src/LLMProviders/zhipu'
import { REASONING_BLOCK_END_MARKER, REASONING_BLOCK_START_MARKER } from 'src/LLMProviders/utils'
import type { BaseOptions, Message, ProviderSettings, ResolveEmbedAsBinary, Vendor } from 'src/types/provider'
import { isCustomOpenChatProvider } from 'src/utils/aiProviderMetadata'
import { DebugLogger } from 'src/utils/DebugLogger'

type ZhipuCompletionMessage = {
	content?: unknown
	reasoning_content?: unknown
}

const truncatePreview = (value: string, maxLength = 1200): string => {
	if (value.length <= maxLength) {
		return value
	}
	return `${value.slice(0, maxLength)}...`
}

const isVisibleTestOutput = (chunk: string): boolean => {
	const trimmedChunk = chunk.trim()
	if (!trimmedChunk) {
		return false
	}
	if (trimmedChunk.startsWith(REASONING_BLOCK_START_MARKER)) {
		return false
	}
	if (trimmedChunk.startsWith(`:${REASONING_BLOCK_END_MARKER}`)) {
		return false
	}
	return true
}

const runZhipuNonStreamingFallback = async (
	providerOptions: BaseOptions,
	messages: Message[]
): Promise<boolean> => {
	const apiKey = typeof providerOptions.apiKey === 'string' ? providerOptions.apiKey.trim() : ''
	const baseURL = typeof providerOptions.baseURL === 'string' ? providerOptions.baseURL.trim() : ''
	const model = typeof providerOptions.model === 'string' ? providerOptions.model.trim() : ''
	if (!apiKey || !baseURL || !model) {
		return false
	}

	const controller = new AbortController()
	const timeoutId = globalThis.setTimeout(() => controller.abort(), 10_000)

	try {
		const testStartedAt = Date.now()
		DebugLogger.warn('[ModelTest] 开始测试模型', {
			vendor: 'Zhipu',
			model,
			baseURL,
		})
		const client = new OpenAI({
			apiKey,
			baseURL,
			dangerouslyAllowBrowser: true,
			fetch: createZhipuLoggedFetch('model-test-fast')
		})
		const thinkingType =
			providerOptions.thinkingType === 'enabled'
			|| providerOptions.thinkingType === 'disabled'
			|| providerOptions.thinkingType === 'auto'
				? providerOptions.thinkingType
				: 'auto'
		const requestBody = {
			model,
			messages: messages as OpenAI.ChatCompletionMessageParam[],
			stream: false,
			thinking: buildZhipuThinkingConfig({
				enableReasoning: providerOptions.enableReasoning === true,
				thinkingType
			})
		} as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming
		const completion = await client.chat.completions.create(
			requestBody,
			{ signal: controller.signal }
		)
		const rawCompletion = completion as unknown as Record<string, unknown>
		const choices = Array.isArray(rawCompletion.choices) ? rawCompletion.choices : []
		if (choices.length === 0) {
			DebugLogger.error('[ModelTest] 智谱快速测试返回结构异常', {
				vendor: 'Zhipu',
				model,
				baseURL,
				keys: Object.keys(rawCompletion),
				responsePreview: truncatePreview(JSON.stringify(rawCompletion)),
			})
			return false
		}

		const message = completion.choices[0]?.message as ZhipuCompletionMessage | undefined
		const content = typeof message?.content === 'string' ? message.content.trim() : ''
		const reasoningContent =
			typeof message?.reasoning_content === 'string' ? message.reasoning_content.trim() : ''
		const durationMs = Date.now() - testStartedAt
		if (durationMs >= 3000) {
			DebugLogger.warn('[ModelTest] 智谱快速测试耗时偏高', {
				vendor: 'Zhipu',
				model,
				baseURL,
				durationMs,
				hasContent: content.length > 0,
				hasReasoningContent: reasoningContent.length > 0,
			})
		}
		return isVisibleTestOutput(content) || isVisibleTestOutput(reasoningContent)
	} catch (error) {
		DebugLogger.error('[ModelTest] 智谱快速测试失败', {
			vendor: 'Zhipu',
			model,
			baseURL,
			error,
		})
		return false
	} finally {
		globalThis.clearTimeout(timeoutId)
	}
}

const runProviderTestFallback = async (
	vendorName: string,
	providerOptions: BaseOptions,
	messages: Message[]
): Promise<boolean> => {
	if (vendorName === 'Zhipu') {
		return runZhipuNonStreamingFallback(providerOptions, messages)
	}
	return false
}

const runFastProviderConnectivityTest = async (
	vendorName: string,
	providerOptions: BaseOptions,
	messages: Message[]
): Promise<boolean | null> => {
	if (vendorName === 'Zhipu') {
		if (isZhipuAnthropicBaseURL(String(providerOptions.baseURL ?? ''))) {
			return null
		}
		return await runZhipuNonStreamingFallback(providerOptions, messages)
	}
	return null
}

interface TestProviderConfigurationParams {
	provider: ProviderSettings
	vendor: Vendor
	getVendorApiKey: (vendor: string) => string
}

export const testProviderConfiguration = async (
	params: TestProviderConfigurationParams
): Promise<boolean> => {
	new Notice(t('Testing model...'))

	const testStartedAt = Date.now()
	try {
		const useProviderScopedApiKey = isCustomOpenChatProvider(params.provider.options.parameters)
		const providerOptions: BaseOptions = {
			...params.provider.options,
			apiKey:
				typeof params.provider.options.apiKey === 'string' && params.provider.options.apiKey.trim().length > 0
					? params.provider.options.apiKey
					: useProviderScopedApiKey
						? ''
						: params.getVendorApiKey(params.provider.vendor),
			baseURL: normalizeProviderBaseURLForRuntime(
				params.provider.vendor,
				String(params.provider.options.baseURL ?? '')
			)
		}
		const sendRequest = params.vendor.sendRequestFunc(providerOptions)
		const controller = new AbortController()
		const resolveEmbed: ResolveEmbedAsBinary = async () => {
			throw new Error(t('Model test embed unsupported'))
		}
		const saveAttachment = async (filename: string, data: ArrayBuffer) => {
			DebugLogger.debug(
				`[Test Mode] Would save file: ${filename}, size: ${data.byteLength} bytes`
			)
		}
		const messages: Message[] = [
			{ role: 'system', content: t('Model test system prompt') },
			{ role: 'user', content: t('Model test user prompt') }
		]
		const fastTestResult = await runFastProviderConnectivityTest(
			params.vendor.name,
			providerOptions,
			messages
		)
		if (fastTestResult !== null) {
			const durationMs = Date.now() - testStartedAt
			DebugLogger.warn('[ModelTest] 快速测试结束', {
				vendor: params.vendor.name,
				model: providerOptions.model,
				baseURL: providerOptions.baseURL,
				durationMs,
				success: fastTestResult,
			})
			if (!fastTestResult) {
				throw new Error(t('Model test empty response'))
			}
			new Notice(t('Model test succeeded'))
			return true
		}
		let received = ''
		let firstChunkMs: number | null = null
		for await (const chunk of sendRequest(messages, controller, resolveEmbed, saveAttachment)) {
			if (!isVisibleTestOutput(chunk)) {
				continue
			}
			if (firstChunkMs === null) {
				firstChunkMs = Date.now() - testStartedAt
				if (firstChunkMs >= 3000) {
					DebugLogger.warn('[ModelTest] 流式测试首包耗时偏高', {
						vendor: params.vendor.name,
						model: providerOptions.model,
						baseURL: providerOptions.baseURL,
						firstChunkMs,
					})
				}
			}
			received += chunk
			if (received.length > 2000) {
				received = received.slice(0, 2000)
			}
			controller.abort()
			break
		}
		if (received.trim().length === 0) {
			const fallbackSucceeded = await runProviderTestFallback(
				params.vendor.name,
				providerOptions,
				messages
			)
			if (fallbackSucceeded) {
				new Notice(t('Model test succeeded'))
				return true
			}
			throw new Error(t('Model test empty response'))
		}
		DebugLogger.warn('[ModelTest] 流式测试成功', {
			vendor: params.vendor.name,
			model: providerOptions.model,
			baseURL: providerOptions.baseURL,
			durationMs: Date.now() - testStartedAt,
			firstChunkMs,
			receivedLength: received.length,
		})
		new Notice(t('Model test succeeded'))
		return true
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (error instanceof Error && error.name === 'AbortError') {
			new Notice(t('Model test succeeded'))
			return true
		}
		DebugLogger.error('[ModelTest] 模型测试失败', {
			vendor: params.vendor.name,
			model: params.provider.options.model,
			baseURL: params.provider.options.baseURL,
			durationMs: Date.now() - testStartedAt,
			error,
		})
		new Notice(`${t('Model test failed')}: ${message}`)
		return false
	}
}
