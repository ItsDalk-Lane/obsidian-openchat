import type { BaseOptions } from '.'

export type OpenRouterReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'

/**
 * OpenRouter 选项接口
 * 扩展基础选项以支持网络搜索、图像生成和推理功能
 */
export interface OpenRouterOptions extends BaseOptions {
	enableWebSearch: boolean
	webSearchEngine?: 'native' | 'exa'
	webSearchMaxResults?: number
	webSearchPrompt?: string
	imageAspectRatio?: '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9'
	imageStream?: boolean
	imageResponseFormat?: 'url' | 'b64_json'
	imageSaveAsAttachment?: boolean
	imageDisplayWidth?: number
	enableReasoning?: boolean
	reasoningEffort?: OpenRouterReasoningEffort
}

export interface WebSearchPlugin {
	id: 'web'
	engine?: 'native' | 'exa'
	max_results?: number
	search_prompt?: string
}

export const isImageGenerationModel = (model: string): boolean => {
	if (!model) return false

	const knownImageGenerationModels = [
		'openai/gpt-5-image-mini',
		'openai/gpt-5-image',
		'google/gemini-2.5-flash-image',
		'google/gemini-2.5-flash-image-preview',
	]

	if (knownImageGenerationModels.includes(model)) {
		return true
	}

	return model.toLowerCase().includes('image')
}
