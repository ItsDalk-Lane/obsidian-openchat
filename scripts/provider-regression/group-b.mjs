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
		qianFanModule.qianFanNormalizeBaseURL('https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat') ===
			'https://qianfan.baidubce.com/v2',
		'PR9-1: legacy Wenxin RPC baseURL should migrate to official /v2 endpoint',
	)
	assert(
		qianFanModule.qianFanNormalizeBaseURL('https://qianfan.bj.baidubce.com/v2/chat/completions') ===
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

	const providerUtilsSource = fs.readFileSync(
		path.resolve(ROOT, 'src/components/settings-components/provider-config/providerUtils.ts'),
		'utf-8',
	)
	assert(
		providerUtilsSource.includes('${qianFanNormalizeBaseURL(options.baseURL)}/models'),
		'PR9-4: QianFan model list fetching should resolve official /v2/models URL',
	)
	assert(
		providerUtilsSource.includes('qianFanNormalizeBaseURL(options.baseURL)'),
		'PR9-4: QianFan model list URL should reuse provider baseURL normalization',
	)
}

export const runPR10 = async () => {
	const poePath = path.resolve(PROVIDERS_ROOT, 'poe.ts')
	const poeMessageTransformsPath = path.resolve(PROVIDERS_ROOT, 'poeMessageTransforms.ts')
	const poeUtilsPath = path.resolve(PROVIDERS_ROOT, 'poeUtils.ts')
	const poeRunnerSharedPath = path.resolve(PROVIDERS_ROOT, 'poeRunnerShared.ts')
	const poeResponsesRunnersPath = path.resolve(PROVIDERS_ROOT, 'poeResponsesRunners.ts')
	const providerUtilsPath = path.resolve(
		ROOT,
		'src/components/settings-components/provider-config/providerUtils.ts'
	)
	const toolRegistryPath = path.resolve(ROOT, 'src/tools/runtime/tool-registry.ts')
	const poeUtilsModule = loadTsModule(poeUtilsPath)

	const mapped = poeUtilsModule.poeMapResponsesParams({
		max_tokens: 2048,
		temperature: 0.3,
		previous_response_id: 'resp_123'
	})
	assert(mapped.max_output_tokens === 2048, 'PR10-1: Poe max_tokens should map to max_output_tokens')
	assert(mapped.max_tokens === undefined, 'PR10-1: Poe mapped params should drop max_tokens')
	assert(
		mapped.previous_response_id === undefined,
		'PR10-1: Poe mapped params should drop previous_response_id to avoid implicit ZDR-incompatible continuation state',
	)
	assert(
		poeUtilsModule.normalizePoeBaseURL('https://api.poe.com/v1/chat/completions') ===
			'https://api.poe.com/v1',
		'PR10-2: Poe baseURL normalization should strip chat/completions suffixes',
	)
	assert(
		poeUtilsModule.normalizePoeBaseURL('https://api.poe.com/v1/responses') ===
			'https://api.poe.com/v1',
		'PR10-2: Poe baseURL normalization should strip responses suffixes',
	)
	assert(
		poeUtilsModule.shouldRetryWithoutPreviousResponseId(
			new Error('400 Previous response cannot be used for this organization due to Zero Data Retention.')
		) === true,
		'PR10-2: Poe should detect Zero Data Retention previous_response_id errors and retry without previous_response_id',
	)
	assert(
		poeUtilsModule.isPoeOrganizationKnownZdr('https://api.poe.com/v1', 'test-key') === false,
		'PR10-2: Poe should not treat organizations as ZDR before detection',
	)
	poeUtilsModule.markPoeOrganizationAsZdr('https://api.poe.com/v1', 'test-key')
	assert(
		poeUtilsModule.isPoeOrganizationKnownZdr('https://api.poe.com/v1/responses', 'test-key') === true,
		'PR10-2: Poe should remember ZDR organizations across future requests after detection',
	)

	const poeSource = fs.readFileSync(poePath, 'utf-8')
	const poeResponsesRunnersSource = fs.readFileSync(poeResponsesRunnersPath, 'utf-8')
	assert(
		poeSource.includes('enableReasoning: false'),
		'PR10-3: Poe default options should disable reasoning by default',
	)
	assert(
		poeSource.includes('enableWebSearch: false'),
		'PR10-3: Poe default options should disable web search by default',
	)
	assert(
		poeSource.includes("'Web Search'") &&
			poeSource.includes("'Reasoning'"),
		'PR10-3: Poe capabilities should include Web Search and Reasoning',
	)
	assert(
		fs.readFileSync(poeRunnerSharedPath, 'utf-8').includes('shouldRetryFunctionOutputTurn400'),
		'PR10-3: Poe should include 400 compatibility retry for function_call_output turns',
	)
	assert(
		fs.readFileSync(poeRunnerSharedPath, 'utf-8').includes('toToolResultContinuationInput'),
		'PR10-3: Poe should retain tool result continuation compatibility inside Responses flow',
	)
	assert(
		fs.readFileSync(poeRunnerSharedPath, 'utf-8').includes("message.includes('protocol_messages')"),
		'PR10-3: Poe should detect protocol_messages compatibility errors for function_call_output retry',
	)
	assert(
		fs.readFileSync(poeResponsesRunnersPath, 'utf-8').includes('shouldRetryFunctionOutputTurn400'),
		'PR10-3: Poe responses runner should wire the 400 compatibility retry helper into continuation requests',
	)
	assert(
		poeResponsesRunnersSource.includes('shouldRetryWithoutPreviousResponseId'),
		'PR10-3: Poe responses runner should retry continuation requests without previous_response_id when ZDR blocks response chaining',
	)
	assert(
		poeResponsesRunnersSource.includes('const createResponsesStream = async'),
		'PR10-3: Poe responses runner should route all continuation create calls through a shared ZDR fallback wrapper',
	)
	assert(
		poeResponsesRunnersSource.includes('isPoeOrganizationKnownZdr(context.baseURL, context.apiKey)'),
		'PR10-3: Poe responses runner should preemptively use message continuation for organizations already known to require ZDR-safe flow',
	)
	assert(
		poeResponsesRunnersSource.includes('markPoeOrganizationAsZdr(context.baseURL, context.apiKey)'),
		'PR10-3: Poe responses runner should persist ZDR detection after the first previous_response_id rejection',
	)
	assert(
		poeResponsesRunnersSource.includes('appendZdrSafeContinuationMessages'),
		'PR10-3: Poe should build ZDR-safe plain-message continuation state after tool execution',
	)
	assert(
		poeResponsesRunnersSource.includes('accumulatedMessageInput'),
		'PR10-3: Poe should maintain a message-based accumulated input for Zero Data Retention continuation',
	)
	assert(
		poeResponsesRunnersSource.includes('toToolResultContinuationInput(toolResultInput)'),
		'PR10-3: Poe ZDR continuation should convert tool results into plain user continuation messages',
	)
	assert(
		poeSource.includes('runResponsesWithOpenAISdk(requestContext)'),
		'PR10-3: Poe should route requests through the OpenAI SDK Responses runner',
	)
	assert(
		!poeSource.includes('runStreamingChatCompletionByFetch'),
		'PR10-3: Poe should not retain Chat Completions fetch runners in the main provider flow',
	)
	assert(
		!poeSource.includes('runStreamingChatCompletion('),
		'PR10-3: Poe should not retain Chat Completions SDK runners in the main provider flow',
	)
	assert(
		!poeSource.includes('runChatCompletionFallback'),
		'PR10-3: Poe should not retain Chat Completions fallback in the main provider flow',
	)
	assert(
		!poeSource.includes('runResponsesStreamByFetch'),
		'PR10-3: Poe should not retain fetch-based Responses runners in the main provider flow',
	)
	assert(
		!poeSource.includes('runResponsesWithDesktopFetchSse'),
		'PR10-3: Poe should not retain desktop SSE fallback in the main provider flow',
	)
	assert(
		!poeSource.includes('runResponsesWithDesktopRequestUrl'),
		'PR10-3: Poe should not retain requestUrl fallback in the main provider flow',
	)
	assert(
		!poeSource.includes('runMcpHybridToolLoop'),
		'PR10-3: Poe should not retain hybrid Chat/Responses runners in the main provider flow',
	)
	assert(
		fs.readFileSync(poeResponsesRunnersPath, 'utf-8').includes("summary: 'auto'"),
		'PR10-3: Poe should request reasoning summaries when reasoning mode is enabled',
	)
	assert(
		poeResponsesRunnersSource.includes('extractReasoningTextFromResponse(completedResponse)'),
		'PR10-3: Poe should fall back to completed-response reasoning extraction when reasoning deltas are absent',
	)
	assert(
		poeSource.includes('toResponsesFunctionToolsFromMcp'),
		'PR10-3: Poe should convert MCP tools into Responses function tools',
	)
	assert(
		poeSource.includes('POE_RETRY_OPTIONS') &&
			poeSource.includes('baseDelayMs: 250'),
		'PR10-3: Poe should retain exponential retry configuration for transient upstream errors',
	)

	const providerUtilsSource = fs.readFileSync(providerUtilsPath, 'utf-8')
	assert(
		providerUtilsSource.includes('[poeVendor.name]'),
		'PR10-4: MODEL_FETCH_CONFIGS should include Poe',
	)
	assert(
		providerUtilsSource.includes('resolvePoeModelListURL'),
		'PR10-4: providerUtils should define resolvePoeModelListURL helper',
	)
	assert(
		providerUtilsSource.includes('https://api.poe.com/v1/models'),
		'PR10-4: Poe model list should fall back to official /v1/models endpoint',
	)

	const poeMessageTransformsModule = loadTsModule(poeMessageTransformsPath, {
		'./poeUtils': { toResponseRole: (role) => (role === 'assistant' || role === 'system' ? role : 'user') },
		'./utils': {
			convertEmbedToImageUrl: async () => ({ type: 'image_url', image_url: { url: 'https://example.com/image.png' } }),
		},
	})
	const assistantMessage = await poeMessageTransformsModule.formatMsgForResponses(
		{ role: 'assistant', content: 'assistant reply' },
		async () => new ArrayBuffer(0)
	)
	const userMessage = await poeMessageTransformsModule.formatMsgForResponses(
		{ role: 'user', content: 'user request' },
		async () => new ArrayBuffer(0)
	)
	const systemMessage = await poeMessageTransformsModule.formatMsgForResponses(
		{ role: 'system', content: 'system prompt' },
		async () => new ArrayBuffer(0)
	)
	const emptyUserMessage = await poeMessageTransformsModule.formatMsgForResponses(
		{ role: 'user', content: '' },
		async () => new ArrayBuffer(0)
	)
	assert(
		assistantMessage.content?.[0]?.type === 'output_text',
		'PR10-5: Poe assistant history messages should use output_text content blocks in Responses input',
	)
	assert(
		userMessage.content?.[0]?.type === 'input_text',
		'PR10-5: Poe user history messages should continue using input_text content blocks in Responses input',
	)
	assert(
		systemMessage.content?.[0]?.type === 'input_text',
		'PR10-5: Poe system messages should use input_text content blocks in Responses input',
	)
	assert(
		emptyUserMessage.content?.length === 1
			&& emptyUserMessage.content?.[0]?.type === 'input_text'
			&& emptyUserMessage.content?.[0]?.text === '',
		'PR10-5: Poe empty user messages should keep a fallback empty input_text content block',
	)

	const { z } = await import('zod')
	const { zodToJsonSchema } = await import('zod-to-json-schema')
	const toolRegistryModule = loadTsModule(toolRegistryPath, {
		zod: { z },
		'zod-to-json-schema': { zodToJsonSchema },
		'src/services/mcp/types': {},
		'./types': {},
	})
	const registry = new toolRegistryModule.BuiltinToolRegistry()
	registry.register({
		name: 'read_file',
		title: '读取文本文件',
		description: 'test',
		inputSchema: z.object({
			start_line: z.number().int().positive().optional(),
			line_count: z.number().int().positive().max(1000),
		}).strict(),
		execute: async () => ({}),
	})
	const registeredTools = registry.listTools('builtin')
	const readFileSchema = registeredTools[0]?.inputSchema?.properties
	const startLineSchema = readFileSchema?.start_line
	const lineCountSchema = readFileSchema?.line_count
	assert(
		typeof startLineSchema?.exclusiveMinimum === 'number' && startLineSchema.exclusiveMinimum === 0,
		'PR10-6: built-in tool schemas should normalize exclusiveMinimum to numeric OpenAPI-compatible form',
	)
	assert(
		typeof lineCountSchema?.exclusiveMinimum === 'number' && lineCountSchema.exclusiveMinimum === 0,
		'PR10-6: positive numeric tool args should not emit boolean exclusiveMinimum in function tool schema',
	)
}
