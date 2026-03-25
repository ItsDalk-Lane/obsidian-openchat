import { fs, path, assert, loadTsModule, MCP_HANDLER_MOCK, PROVIDERS_ROOT, ROOT, SETTINGS_PANEL_PATH } from './shared.mjs'

export const runPR7 = async () => {
	const errorsPath = path.resolve(PROVIDERS_ROOT, 'errors.ts')
	const errorsModule = loadTsModule(errorsPath)
	const retryPath = path.resolve(PROVIDERS_ROOT, 'retry.ts')
	const retryModule = loadTsModule(retryPath, {
		'./errors': errorsModule,
	})

	const authError = errorsModule.normalizeProviderError({ status: 401, message: 'bad key' })
	assert(authError.type === 'auth', 'PR7-1: 401 should classify as auth error')
	assert(authError.retryable === false, 'PR7-1: auth errors must not be retryable')

	let attempts = 0
	const retryResult = await retryModule.withRetry(
		async () => {
			attempts += 1
			if (attempts < 2) {
				const error = new Error('rate limited')
				error.status = 429
				throw error
			}
			return 'ok'
		},
		{ maxRetries: 2, baseDelayMs: 1, maxDelayMs: 2, jitterRatio: 0 },
	)
	assert(retryResult === 'ok', 'PR7-2: retry should eventually return success for retryable 429 errors')
	assert(attempts === 2, 'PR7-2: retry should perform one retry for initial 429 failure')

	const abortController = new AbortController()
	abortController.abort()
	let abortAttempts = 0
	let abortThrown = false
	try {
		await retryModule.withRetry(
			async () => {
				abortAttempts += 1
				const error = new Error('network timeout')
				error.name = 'TypeError'
				throw error
			},
			{ signal: abortController.signal, maxRetries: 2, baseDelayMs: 1, maxDelayMs: 2, jitterRatio: 0 },
		)
	} catch (error) {
		abortThrown = true
		const normalized = errorsModule.normalizeProviderError(error)
		assert(normalized.isAbort === true, 'PR7-3: aborted requests should be marked as user cancellation')
	}
	assert(abortThrown, 'PR7-3: aborted requests should throw immediately')
	assert(abortAttempts === 0, 'PR7-3: aborted requests should not retry user-cancelled operations')

	for (const file of [
		'src/LLMProviders/openAI.ts',
		'src/LLMProviders/openRouter.ts',
		'src/LLMProviders/claude.ts',
		'src/LLMProviders/doubao.ts',
	]) {
		const source = fs.readFileSync(path.resolve(ROOT, file), 'utf-8')
		assert(source.includes('withRetry'), `PR7-4: ${file} should integrate shared retry helper`)
		assert(source.includes('normalizeProviderError'), `PR7-4: ${file} should integrate shared error normalization`)
	}
}

export const runPR8 = () => {
	const openRouterPath = path.resolve(PROVIDERS_ROOT, 'openRouter.ts')
	const openRouterSource = fs.readFileSync(openRouterPath, 'utf-8')
	assert(
		openRouterSource.includes('data.response_format = imageResponseFormat'),
		'PR8-1: OpenRouter imageResponseFormat must be written into request body response_format',
	)

	const settingTabSource = fs.readFileSync(SETTINGS_PANEL_PATH, 'utf-8')
	assert(
		settingTabSource.includes('response_format 字段'),
		'PR8-2: settings should explain that imageResponseFormat maps to request body response_format',
	)
	assert(
		settingTabSource.includes('参数生效范围'),
		'PR8-2: settings should include effective-scope hints for model-specific parameters',
	)
}

export const runPR9 = () => {
	const qianFanPath = path.resolve(PROVIDERS_ROOT, 'qianFan.ts')
	const qianFanModule = loadTsModule(qianFanPath, {
		openai: class MockOpenAI {},
		obsidian: {
			Notice: class {},
			requestUrl: async () => ({ status: 200, json: {}, text: '', arrayBuffer: new ArrayBuffer(0) }),
		},
		'tars/lang/helper': { t: (text) => text },
		'.': {},
		'../mcp/mcpToolCallHandler': MCP_HANDLER_MOCK,
		'./utils': {
			buildReasoningBlockEnd: () => '',
			buildReasoningBlockStart: () => '',
			convertEmbedToImageUrl: async () => ({ type: 'image_url', image_url: { url: '' } }),
		},
		'./messageFormat': {
			withToolMessageContext: (_msg, payload) => payload,
		},
		'../../../utils/DebugLogger': { DebugLogger: { debug: () => {} } },
	})

	assert(
		qianFanModule.qianFanVendor.defaultOptions.baseURL === 'https://qianfan.baidubce.com/v2',
		'PR9-1: QianFan default baseURL should use official /v2 endpoint',
	)
	assert(
		qianFanModule.qianFanNormalizeBaseURLForTest('https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat') ===
			'https://qianfan.baidubce.com/v2',
		'PR9-1: legacy Wenxin RPC baseURL should migrate to official /v2 endpoint',
	)
	assert(
		qianFanModule.qianFanNormalizeBaseURLForTest('https://qianfan.bj.baidubce.com/v2/chat/completions') ===
			'https://qianfan.bj.baidubce.com/v2',
		'PR9-1: regional QianFan baseURL should normalize to /v2 root',
	)
	assert(
		!Object.prototype.hasOwnProperty.call(qianFanModule.qianFanVendor.defaultOptions, 'apiSecret'),
		'PR9-1: QianFan default options should no longer require API secret',
	)
	assert(
		qianFanModule.qianFanIsImageGenerationModel('qwen-image') === true,
		'PR9-2: qwen-image should be recognized as QianFan image generation model',
	)
	assert(
		qianFanModule.qianFanIsImageGenerationModel('deepseek-vl2') === false,
		'PR9-2: deepseek-vl2 should stay on chat/vision path instead of image generation endpoint',
	)
	assert(
		qianFanModule.qianFanVendor.capabilities.includes('Image Vision') &&
			qianFanModule.qianFanVendor.capabilities.includes('Reasoning') &&
			qianFanModule.qianFanVendor.capabilities.includes('Image Generation'),
		'PR9-3: QianFan capabilities should include vision, reasoning, and image generation',
	)

	const settingTabSource = fs.readFileSync(SETTINGS_PANEL_PATH, 'utf-8')
	assert(
		settingTabSource.includes('resolveQianFanModelListURL'),
		'PR9-4: QianFan model list fetching should resolve official /v2/models URL',
	)
	assert(
		settingTabSource.includes('qianFanNormalizeBaseURL(baseURL)'),
		'PR9-4: QianFan model list URL should reuse provider baseURL normalization',
	)
}

export const runPR10 = () => {
	const poePath = path.resolve(PROVIDERS_ROOT, 'poe.ts')
	const poeModule = loadTsModule(poePath, {
		openai: class MockOpenAI {},
		obsidian: {
			Platform: { isDesktopApp: false },
			requestUrl: async () => ({ status: 200, json: {}, text: '' }),
		},
		'tars/lang/helper': { t: (text) => text },
		'.': {},
		'../mcp/mcpToolCallHandler': MCP_HANDLER_MOCK,
		'./errors': {
			normalizeProviderError: (error, prefix = 'error') =>
				error instanceof Error ? new Error(`${prefix}: ${error.message}`) : new Error(String(error)),
		},
		'./retry': {
			withRetry: async (operation) => operation(),
		},
		'./sse': { feedChunk: () => ({ events: [], rest: '', done: false }) },
		'./utils': {
			buildReasoningBlockEnd: () => '',
			buildReasoningBlockStart: () => '',
			convertEmbedToImageUrl: async () => ({ type: 'image_url', image_url: { url: '' } }),
		},
	})

	const mapped = poeModule.poeMapResponsesParams({ max_tokens: 2048, temperature: 0.3 })
	assert(mapped.max_output_tokens === 2048, 'PR10-1: Poe max_tokens should map to max_output_tokens')
	assert(mapped.max_tokens === undefined, 'PR10-1: Poe mapped params should drop max_tokens')
	assert(
		poeModule.poeResolveResponsesURL('https://api.poe.com/v1/chat/completions') ===
			'https://api.poe.com/v1/responses',
		'PR10-2: Poe responses URL should convert from chat/completions',
	)
	assert(
		poeModule.poeResolveChatCompletionsURL('https://api.poe.com/v1/responses') ===
			'https://api.poe.com/v1/chat/completions',
		'PR10-2: Poe chat URL should convert from responses',
	)
	assert(
		poeModule.poeVendor.defaultOptions.enableReasoning === false,
		'PR10-3: Poe default options should disable reasoning by default',
	)
	assert(
		poeModule.poeVendor.defaultOptions.enableWebSearch === false,
		'PR10-3: Poe default options should disable web search by default',
	)
	assert(
		poeModule.poeVendor.capabilities.includes('Web Search') &&
			poeModule.poeVendor.capabilities.includes('Reasoning'),
		'PR10-3: Poe capabilities should include Web Search and Reasoning',
	)
	const poeSource = fs.readFileSync(poePath, 'utf-8')
	assert(
		poeSource.includes('shouldRetryFunctionOutputTurn400'),
		'PR10-3: Poe should include 400 compatibility retry for function_call_output turns',
	)
	assert(
		poeSource.includes('toToolResultContinuationInput'),
		'PR10-3: Poe should convert function_call_output turns to message input when provider requires protocol messages',
	)
	assert(
		poeSource.includes("message.includes('protocol_messages')"),
		'PR10-3: Poe should detect protocol_messages compatibility errors for function_call_output retry',
	)
	assert(
		poeSource.includes('throw: false'),
		'PR10-3: Poe requestUrl path should keep non-2xx response body for diagnostics',
	)
	assert(
		poeSource.includes('error.status = response.status'),
		'PR10-3: Poe requestUrl errors should expose status for retry classification',
	)
	assert(
		poeSource.includes('parsePoeJsonResponseText'),
		'PR10-3: Poe requestUrl path should parse response text safely without relying on response.json',
	)
	assert(
		poeSource.includes('if (hasMcpToolRuntime)') &&
			poeSource.includes('runResponsesWithDesktopRequestUrl()'),
		'PR10-3: Poe should route MCP runtime through requestUrl responses loop for stable continuation handling',
	)
	assert(
		poeSource.includes('POE_RETRY_OPTIONS') &&
			poeSource.includes('baseDelayMs: 250') &&
			poeSource.includes('withRetry('),
		'PR10-3: Poe should apply exponential retry for transient 429/5xx errors',
	)

	const settingTabSource = fs.readFileSync(SETTINGS_PANEL_PATH, 'utf-8')
	assert(
		settingTabSource.includes('[poeVendor.name]'),
		'PR10-4: MODEL_FETCH_CONFIGS should include Poe',
	)
	assert(
		settingTabSource.includes('resolvePoeModelListURL'),
		'PR10-4: settingTab should define resolvePoeModelListURL helper',
	)
	assert(
		settingTabSource.includes('https://api.poe.com/v1/models'),
		'PR10-4: Poe model list should fall back to official /v1/models endpoint',
	)
}
