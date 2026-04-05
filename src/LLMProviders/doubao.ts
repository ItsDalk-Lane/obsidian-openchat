import { t } from 'src/i18n/ai-runtime/helper'
import {
	BaseOptions,
	mergeProviderOptionsWithParameters,
	Message,
	ResolveEmbedAsBinary,
	SaveAttachment,
	SendRequest,
	Vendor,
} from './provider-shared'
import {
	DEFAULT_DOUBAO_IMAGE_OPTIONS,
	doubaoImageVendor,
	DOUBAO_IMAGE_MODELS,
	DoubaoImageOptions,
	isDoubaoImageGenerationModel,
} from './doubaoImage'
import { resolveDoubaoImageEndpoint } from './doubaoUtils'
import { sendDoubaoResponsesRequest } from './doubaoResponses'

export type DoubaoThinkingType = 'enabled' | 'disabled' | 'auto'
export type DoubaoReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'

const DOUBAO_KNOWN_CHAT_MODELS = [
	'doubao-seed-2-0-pro-260215',
	'doubao-seed-1-6-vision-250815',
	'doubao-seed-1-6-lite-251015',
	'doubao-seed-1-6-250615',
	'doubao-seed-1-6-251015',
	'doubao-seed-1-6-flash-250828',
	'doubao-seed-1-6-flash-250715',
	'doubao-seed-1-6-flash-250615',
	'doubao-1-5-thinking-vision-pro-250428',
	'doubao-1-5-ui-tars-250428',
	'doubao-1-5-thinking-pro-m-250428'
]

export const DOUBAO_REASONING_EFFORT_OPTIONS: DoubaoReasoningEffort[] = ['minimal', 'low', 'medium', 'high']
export const DEFAULT_DOUBAO_THINKING_TYPE: DoubaoThinkingType = 'enabled'

// Doubao图片理解配置选项
export interface DoubaoOptions extends BaseOptions {
	enableReasoning?: boolean // 是否启用推理功能（受聊天界面“推理”按钮控制）
	thinkingType?: DoubaoThinkingType
	reasoningEffort?: DoubaoReasoningEffort
	// 图片理解精细度控制
	imageDetail?: 'low' | 'high'
	imagePixelLimit?: {
		minPixels?: number
		maxPixels?: number
	}
	// Web Search 相关配置
	webSearchConfig?: {
		limit?: number
		maxKeyword?: number
		sources?: string[]
		userLocation?: {
			country?: string
			region?: string
			city?: string
		}
		systemPrompt?: string // 系统提示词，用于指导搜索行为
		enableThinking?: boolean // 是否启用思考过程（边想边搜）
	}
	// 图片生成参数（与 DoubaoImage 兼容）
	displayWidth?: number
	size?: DoubaoImageOptions['size']
	response_format?:
		| DoubaoImageOptions['response_format']
		| {
				type: 'json_object' | 'json_schema'
				json_schema?: Record<string, unknown>
			}
	watermark?: boolean
	sequential_image_generation?: DoubaoImageOptions['sequential_image_generation']
	max_images?: number
	stream?: boolean
	optimize_prompt_mode?: DoubaoImageOptions['optimize_prompt_mode']
}

const sendRequestFunc = (settings: BaseOptions): SendRequest =>
	async function* (
		messages: readonly Message[],
		controller: AbortController,
		resolveEmbedAsBinary: ResolveEmbedAsBinary,
		saveAttachment?: SaveAttachment
	) {
		const options = mergeProviderOptionsWithParameters(settings) as DoubaoOptions
		const { apiKey, baseURL, model } = options
		if (!apiKey) throw new Error(t('API key is required'))
		if (!model) throw new Error(t('Model is required'))

		if (isDoubaoImageGenerationModel(model)) {
			const imageOptions: DoubaoImageOptions = {
				...options,
				baseURL: resolveDoubaoImageEndpoint(baseURL),
				displayWidth: options.displayWidth ?? DEFAULT_DOUBAO_IMAGE_OPTIONS.displayWidth,
				size: options.size ?? DEFAULT_DOUBAO_IMAGE_OPTIONS.size,
				response_format:
					typeof options.response_format === 'string'
						? options.response_format
						: DEFAULT_DOUBAO_IMAGE_OPTIONS.response_format,
				watermark: options.watermark ?? DEFAULT_DOUBAO_IMAGE_OPTIONS.watermark,
				sequential_image_generation:
					options.sequential_image_generation ?? DEFAULT_DOUBAO_IMAGE_OPTIONS.sequential_image_generation,
				stream: options.stream ?? DEFAULT_DOUBAO_IMAGE_OPTIONS.stream,
				optimize_prompt_mode:
					options.optimize_prompt_mode ?? DEFAULT_DOUBAO_IMAGE_OPTIONS.optimize_prompt_mode,
				max_images: options.max_images ?? 5,
			}
			const imageSendRequest = doubaoImageVendor.sendRequestFunc(imageOptions)
			yield* imageSendRequest(messages, controller, resolveEmbedAsBinary, saveAttachment)
			return
		}

		const responsesSendRequest = sendDoubaoResponsesRequest(options)
		yield* responsesSendRequest(messages, controller, resolveEmbedAsBinary, saveAttachment)
	}

const models = Array.from(new Set([...DOUBAO_KNOWN_CHAT_MODELS, ...DOUBAO_IMAGE_MODELS]))

export const doubaoVendor: Vendor = {
	name: 'Doubao',
	defaultOptions: {
		apiKey: '',
		baseURL: 'https://ark.cn-beijing.volces.com/api/v3/responses',
		model: '',
		parameters: {},
		thinkingType: DEFAULT_DOUBAO_THINKING_TYPE,
		enableWebSearch: false // 默认不启用 Web Search
	},
	sendRequestFunc: (settings: DoubaoOptions): SendRequest => sendRequestFunc(settings as BaseOptions),
	models,
	websiteToObtainKey: 'https://www.volcengine.com',
	capabilities: ['Text Generation', 'Image Vision', 'Image Generation', 'Web Search', 'Reasoning', 'Structured Output']
}
