import type { BaseOptions, Vendor } from '.'
import { withToolCallLoopSupport } from 'src/core/agents/loop'
import { createOpenRouterSendRequest } from './openRouterRequest'
import { type OpenRouterOptions, type OpenRouterReasoningEffort } from './openRouterShared'

export {
	isImageGenerationModel,
	type OpenRouterOptions,
	type OpenRouterReasoningEffort,
} from './openRouterShared'

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
	sendRequestFunc: withToolCallLoopSupport(createOpenRouterSendRequest as unknown as (settings: BaseOptions) => ReturnType<typeof createOpenRouterSendRequest>, {
		transformApiParams: (apiParams, allOptions) => {
			const enableReasoning = allOptions.enableReasoning as boolean | undefined
			const reasoningEffort = (allOptions.reasoningEffort as string) || 'medium'
			return enableReasoning
				? { ...apiParams, reasoning: { effort: reasoningEffort } }
				: apiParams
		},
	}),
	models: [],
	websiteToObtainKey: 'https://openrouter.ai',
	capabilities: ['Text Generation', 'Image Vision', 'PDF Vision', 'Web Search', 'Image Generation', 'Reasoning'],
}
