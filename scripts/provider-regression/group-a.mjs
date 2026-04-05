import { fs, path, assert, loadTsModule, MCP_HANDLER_MOCK, PROVIDERS_ROOT, ROOT, SETTINGS_PANEL_PATH } from './shared.mjs'

export const runPR1 = () => {
	const ssePath = path.resolve(PROVIDERS_ROOT, 'sse.ts')
	const { feedChunk } = loadTsModule(ssePath)

	{
		let rest = ''
		const allEvents = []
		for (const chunk of ['data: {"choices":[{"delta":{"content":"hel', 'lo"}}]}\n', '\n']) {
			const parsed = feedChunk(rest, chunk)
			rest = parsed.rest
			allEvents.push(...parsed.events)
		}
		assert(allEvents.length === 1, 'PR1-1: fragmented JSON should produce exactly one event')
		const payload = allEvents[0].json
		assert(payload?.choices?.[0]?.delta?.content === 'hello', 'PR1-1: fragmented JSON payload mismatch')
	}

	{
		const input = ': keepalive\n\n\n' + 'data: {"ok":true}\n\n'
		const parsed = feedChunk('', input)
		assert(parsed.events.length === 1, 'PR1-2: comments/empty lines should not emit extra events')
		assert(parsed.events[0].json?.ok === true, 'PR1-2: valid event after comments should still parse')
	}

	{
		const input = 'data: {"step":1}\n\n' + 'data: [DONE]\n\n' + 'data: {"step":2}\n\n'
		const parsed = feedChunk('', input)
		assert(parsed.done === true, 'PR1-3: parser should mark done when [DONE] appears')
		assert(parsed.events.length === 2, 'PR1-3: parser should stop emitting events after [DONE]')
		assert(parsed.events[1].isDone === true, 'PR1-3: second emitted event should be done marker')
	}

	{
		const input = 'data: {"bad":\n\n' + 'data: {"ok":2}\n\n'
		const parsed = feedChunk('', input)
		assert(parsed.events.length === 2, 'PR1-4: parser should keep later events when one JSON is invalid')
		assert(Boolean(parsed.events[0].parseError), 'PR1-4: invalid JSON event should carry parseError')
		assert(parsed.events[1].json?.ok === 2, 'PR1-4: parser should recover and parse subsequent JSON event')
	}
}

export const runPR2 = () => {
	const ssePath = path.resolve(PROVIDERS_ROOT, 'sse.ts')
	const { feedChunk } = loadTsModule(ssePath)
	const qianFanPath = path.resolve(PROVIDERS_ROOT, 'qianFan.ts')
	const qianFanModule = loadTsModule(qianFanPath, {
		openai: class MockOpenAI {},
		axios: {
			post: async () => {
				throw new Error('not implemented in regression test')
			},
			isAxiosError: () => false,
		},
		obsidian: {
			Notice: class {},
			Platform: { isDesktopApp: false },
			requestUrl: async () => ({ status: 200, json: {}, text: '' }),
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
		'./sse': { feedChunk },
	})

	const { qianFanNormalizeBaseURL } = qianFanModule
	assert(
		qianFanNormalizeBaseURL('https://qianfan.baidubce.com') === 'https://qianfan.baidubce.com/v2',
		'PR2-1: baseURL should normalize to the current QianFan OpenAI-compatible v2 endpoint',
	)

	{
		const expectedTokens = Array.from({ length: 20 }, (_, index) => `token-${index}-v`)
		const sseText =
			expectedTokens.map((token) => `data: ${JSON.stringify({ result: token })}\n\n`).join('') + 'data: [DONE]\n\n'

		let seed = 7
		const nextRandom = () => {
			seed = (seed * 1103515245 + 12345) % 2147483648
			return seed / 2147483648
		}

		const chunks = []
		let cursor = 0
		while (cursor < sseText.length) {
			const size = Math.max(1, Math.floor(nextRandom() * 13))
			chunks.push(sseText.slice(cursor, cursor + size))
			cursor += size
		}

		let rest = ''
		const outputs = []
		let stopped = false
		for (const chunk of chunks) {
			const parsed = feedChunk(rest, chunk)
			rest = parsed.rest
			for (const event of parsed.events) {
				if (event.isDone) {
					stopped = true
					break
				}
				const content = event.json?.result
				if (content) outputs.push(content)
			}
			if (stopped) break
		}

		const flushed = feedChunk(rest, '\n\n')
		for (const event of flushed.events) {
			if (event.isDone) break
			const content = event.json?.result
			if (content) outputs.push(content)
		}

		assert(
			JSON.stringify(outputs) === JSON.stringify(expectedTokens),
			'PR2-2: random fragmented SSE should not lose or duplicate QianFan stream content',
		)
	}

}

export const runPR3 = async () => {
	const geminiPath = path.resolve(PROVIDERS_ROOT, 'gemini.ts')
	let capturedGenerateContentArgs = null
	const geminiModule = loadTsModule(geminiPath, {
		'@google/genai': {
			GoogleGenAI: class MockGoogleGenAI {
				constructor() {
					this.models = {
						generateContentStream: async (args) => {
							capturedGenerateContentArgs = args
							return (async function* () {
								yield { text: () => 'streamed output' }
							})()
						},
					}
				}
			},
		},
		openai: class MockOpenAI {},
		'./provider-shared': {
			mergeProviderOptionsWithParameters: (settings) => {
				const merged = {
					...settings,
					...(settings?.parameters && typeof settings.parameters === 'object' ? settings.parameters : {}),
				}
				delete merged.parameters
				return merged
			},
		},
		'src/core/agents/loop/OpenAILoopHandler': {
			withToolCallLoopSupport: (factory) => factory,
		},
		'./utils': {
			arrayBufferToBase64: () => 'ZmFrZQ==',
			getMimeTypeFromFilename: () => 'image/png',
		},
	})

	const {
		geminiNormalizeOpenAIBaseURL,
		geminiBuildConfig,
		geminiIsAuthError,
		geminiVendor,
	} = geminiModule

	assert(
		geminiNormalizeOpenAIBaseURL('https://generativelanguage.googleapis.com') ===
			'https://generativelanguage.googleapis.com/v1beta/openai',
		'PR3-1: baseURL should normalize to Gemini OpenAI-compatible endpoint',
	)
	assert(
		geminiNormalizeOpenAIBaseURL('https://generativelanguage.googleapis.com/v1beta/openai') ===
			'https://generativelanguage.googleapis.com/v1beta/openai',
		'PR3-1: existing OpenAI-compatible endpoint should remain unchanged',
	)

	const mappedConfig = geminiBuildConfig({ max_tokens: 2048, temperature: 0.4 })
	assert(mappedConfig.maxOutputTokens === 2048, 'PR3-2: max_tokens should map to maxOutputTokens')
	assert(mappedConfig.max_tokens === undefined, 'PR3-2: max_tokens should be removed after mapping')

	assert(geminiIsAuthError({ status: 401 }) === true, 'PR3-3: 401 should be recognized as auth error')
	assert(geminiIsAuthError({ message: 'invalid api key' }) === true, 'PR3-3: api key error text should be recognized')
	assert(geminiIsAuthError({ message: 'timeout' }) === false, 'PR3-3: non-auth error should not be misclassified')

	const sendRequest = geminiVendor.sendRequestFunc({
		apiKey: 'test-key',
		baseURL: 'https://generativelanguage.googleapis.com',
		model: 'gemini-2.5-flash',
		parameters: { max_tokens: 2048, temperature: 0.4 },
	})
	const chunks = []
	for await (const chunk of sendRequest(
		[
			{ role: 'system', content: 'you are system' },
			{ role: 'user', content: 'first question' },
			{ role: 'assistant', content: 'first answer' },
			{ role: 'user', content: 'second question', embeds: [{ link: 'a.png' }] },
		],
		new AbortController(),
		async () => new ArrayBuffer(8),
	)) {
		chunks.push(chunk)
	}

	assert(chunks.join('') === 'streamed output', 'PR3-4: Gemini vendor should stream SDK text output')
	assert(
		capturedGenerateContentArgs?.config?.systemInstruction === 'you are system',
		'PR3-4: system message should map to systemInstruction via public Gemini vendor flow',
	)
	assert(
		capturedGenerateContentArgs?.config?.maxOutputTokens === 2048,
		'PR3-4: public Gemini vendor flow should pass mapped maxOutputTokens to the SDK config',
	)
	assert(capturedGenerateContentArgs?.contents?.length === 3, 'PR3-4: non-system history should remain in order')
	assert(capturedGenerateContentArgs?.contents?.[0]?.role === 'user', 'PR3-4: first history message role mismatch')
	assert(capturedGenerateContentArgs?.contents?.[1]?.role === 'model', 'PR3-4: assistant role should map to model')
	assert(
		Boolean(capturedGenerateContentArgs?.contents?.[2]?.parts?.find((part) => Boolean(part.inlineData))),
		'PR3-4: image embeds should be preserved as inlineData parts via public Gemini vendor flow',
	)
}

export const runPR4 = () => {
	const openAIPath = path.resolve(PROVIDERS_ROOT, 'openAI.ts')
	const openAIModule = loadTsModule(openAIPath, {
		openai: class MockOpenAI {},
		'tars/lang/helper': { t: (text) => text },
		'.': {},
		'../mcp/mcpToolCallHandler': MCP_HANDLER_MOCK,
		'./utils': {
			buildReasoningBlockEnd: () => '',
			buildReasoningBlockStart: () => '',
			buildToolCallsBlock: () => '',
			convertEmbedToImageUrl: async () => ({ type: 'image_url', image_url: { url: '' } }),
		},
		'./messageFormat': {
			withToolMessageContext: (_msg, payload) => payload,
		},
		'./errors': {
			normalizeProviderError: (error) => error,
		},
		'./retry': {
			withRetry: async (operation) => operation(),
		},
	})
	assert(
		openAIModule.openAIUseResponsesAPI({ enableReasoning: true }) === true,
		'PR4-1: OpenAI should route to responses when reasoning is enabled',
	)
	assert(
		openAIModule.openAIUseResponsesAPI({ enableReasoning: false }) === false,
		'PR4-1: OpenAI should keep chat path when reasoning is disabled',
	)
	const openAIParams = openAIModule.openAIMapResponsesParams({ max_tokens: 256, temperature: 0.2 })
	assert(openAIParams.max_output_tokens === 256, 'PR4-2: OpenAI max_tokens should map to max_output_tokens')
	assert(openAIParams.max_tokens === undefined, 'PR4-2: OpenAI mapped params should drop max_tokens')

	const azurePath = path.resolve(PROVIDERS_ROOT, 'azure.ts')
	const azureModule = loadTsModule(azurePath, {
		openai: { AzureOpenAI: class MockAzureOpenAI {} },
		'tars/lang/helper': { t: (text) => text },
		'.': {},
		'../mcp/mcpToolCallHandler': MCP_HANDLER_MOCK,
		'./utils': {
			buildReasoningBlockEnd: () => '',
			buildReasoningBlockStart: () => '',
		},
		'../../../utils/DebugLogger': { DebugLogger: { debug: () => {} } },
	})
	assert(
		azureModule.azureUseResponsesAPI({ enableReasoning: true }) === true,
		'PR4-3: Azure should route to responses when reasoning is enabled',
	)
	const azureParams = azureModule.azureMapResponsesParams({ max_tokens: 1024 })
	assert(azureParams.max_output_tokens === 1024, 'PR4-3: Azure max_tokens should map to max_output_tokens')

	const grokPath = path.resolve(PROVIDERS_ROOT, 'grok.ts')
	const grokModule = loadTsModule(grokPath, {
		'tars/lang/helper': { t: (text) => text },
		'.': {},
		'../mcp/mcpToolCallHandler': MCP_HANDLER_MOCK,
		'./utils': {
			buildReasoningBlockEnd: () => '',
			buildReasoningBlockStart: () => '',
			convertEmbedToImageUrl: async () => ({ type: 'image_url', image_url: { url: '' } }),
		},
		'./sse': { feedChunk: () => ({ events: [], rest: '', done: false }) },
	})
	assert(grokModule.grokUseResponsesAPI({ enableReasoning: true }) === true, 'PR4-4: Grok should use responses with reasoning')
	assert(
		grokModule.grokResolveEndpoint('https://api.x.ai/v1/chat/completions', true) ===
			'https://api.x.ai/v1/responses',
		'PR4-4: Grok endpoint should switch from chat/completions to responses',
	)
	assert(
		grokModule.grokResolveEndpoint('https://api.x.ai/v1/chat/completions', false) ===
			'https://api.x.ai/v1/chat/completions',
		'PR4-4: Grok endpoint should keep chat/completions when reasoning is disabled',
	)
}

export const runPR5 = () => {
	const messageFormatPath = path.resolve(PROVIDERS_ROOT, 'messageFormat.ts')
	const { withToolMessageContext } = loadTsModule(messageFormatPath, {
		'.': {},
	})

	const toolCalls = [
		{
			id: 'call_weather',
			type: 'function',
			function: { name: 'weather', arguments: '{"city":"beijing"}' },
		},
		{
			id: 'call_time',
			type: 'function',
			function: { name: 'time', arguments: '{"timezone":"UTC"}' },
		},
	]

	const assistantPayload = withToolMessageContext(
		{
			role: 'assistant',
			content: '',
			tool_calls: toolCalls,
			reasoning_content: 'need tools',
		},
		{
			role: 'assistant',
			content: '',
		},
	)
	assert(Array.isArray(assistantPayload.tool_calls), 'PR5-1: assistant tool_calls should be preserved')
	assert(assistantPayload.tool_calls.length === 2, 'PR5-1: parallel tool_calls should remain isolated')
	assert(
		assistantPayload.tool_calls[0].function.arguments === '{"city":"beijing"}',
		'PR5-1: first tool call arguments should remain unchanged',
	)
	assert(
		assistantPayload.tool_calls[1].function.arguments === '{"timezone":"UTC"}',
		'PR5-1: second tool call arguments should remain unchanged',
	)
	assert(assistantPayload.reasoning_content === 'need tools', 'PR5-1: assistant reasoning_content should be preserved')

	const toolPayload = withToolMessageContext(
		{
			role: 'tool',
			content: '{"temp": 23}',
			tool_call_id: 'call_weather',
		},
		{
			role: 'tool',
			content: '{"temp": 23}',
		},
	)
	assert(toolPayload.tool_call_id === 'call_weather', 'PR5-2: tool message should carry tool_call_id')

	const openAIFile = fs.readFileSync(path.resolve(PROVIDERS_ROOT, 'openAI.ts'), 'utf-8')
	const openRouterFile = fs.readFileSync(path.resolve(PROVIDERS_ROOT, 'openRouter.ts'), 'utf-8')
	const siliconFlowFile = fs.readFileSync(path.resolve(PROVIDERS_ROOT, 'siliconflow.ts'), 'utf-8')
	assert(openAIFile.includes('withToolMessageContext'), 'PR5-3: OpenAI should use withToolMessageContext')
	assert(openRouterFile.includes('withToolMessageContext'), 'PR5-3: OpenRouter should use withToolMessageContext')
	assert(siliconFlowFile.includes('withToolMessageContext'), 'PR5-3: SiliconFlow should use withToolMessageContext')
}

export const runPR6 = () => {
	const settingTabText = fs.readFileSync(SETTINGS_PANEL_PATH, 'utf-8')
	for (const vendorName of ['claudeVendor.name', 'qwenVendor.name', 'zhipuVendor.name', 'deepSeekVendor.name', 'qianFanVendor.name']) {
		assert(
			settingTabText.includes(`[${vendorName}]`),
			`PR6-1: MODEL_FETCH_CONFIGS should include ${vendorName}`,
		)
	}
	assert(
		settingTabText.includes('fallbackModels'),
		'PR6-1: model fetch configs should define fallbackModels for remote fetch failures',
	)
	assert(
		settingTabText.includes('resolveQianFanModelListURL') &&
			settingTabText.includes('qianFanNormalizeBaseURL(baseURL)'),
		'PR6-2: QianFan model fetching should derive OpenAI-compatible /v2/models from normalized baseURL',
	)
	assert(
		settingTabText.includes('/api/v3/models'),
		'PR6-2: DoubaoImage model fetching should try Ark /api/v3/models endpoint first',
	)

	const qwenPath = path.resolve(PROVIDERS_ROOT, 'qwen.ts')
	const qwenModule = loadTsModule(qwenPath, {
		openai: class MockOpenAI {},
		'tars/lang/helper': { t: (text) => text },
		'.': {},
		'../mcp/mcpToolCallHandler': MCP_HANDLER_MOCK,
		'./utils': {
			buildReasoningBlockEnd: () => '',
			buildReasoningBlockStart: () => '',
			convertEmbedToImageUrl: async () => ({ type: 'image_url', image_url: { url: '' } }),
		},
	})
	assert(
		qwenModule.qwenVendor.defaultOptions.model === 'qwen-plus-latest',
		'PR6-3: Qwen default model should be updated to a newer compatible default',
	)

	const zhipuPath = path.resolve(PROVIDERS_ROOT, 'zhipu.ts')
	const zhipuModule = loadTsModule(zhipuPath, {
		openai: class MockOpenAI {},
		'tars/lang/helper': { t: (text) => text },
		'.': {},
		'../mcp/mcpToolCallHandler': MCP_HANDLER_MOCK,
		'../../../utils/DebugLogger': { DebugLogger: { debug: () => {} } },
		'./utils': {
			buildReasoningBlockEnd: () => '',
			buildReasoningBlockStart: () => '',
		},
	})
	assert(
		zhipuModule.zhipuVendor.defaultOptions.model === 'glm-4.6',
		'PR6-3: Zhipu default model should be updated to a newer compatible default',
	)
}
