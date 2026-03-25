import { fs, path, assert, loadAgentLoopModule, loadTsModule, MCP_HANDLER_MOCK, PROVIDERS_ROOT, SETTINGS_PANEL_PATH } from './shared.mjs'

export const runPR11 = async () => {
	const streamQueue = []
	class MockOpenAI {
		constructor() {
			this.chat = {
				completions: {
					create: async () => {
						const parts = streamQueue.shift()
						if (!parts) {
							throw new Error('PR11 mock stream queue is empty')
						}
						return (async function* () {
							for (const part of parts) {
								yield part
							}
						})()
					},
				},
			}
		}
	}

	const loopModule = loadAgentLoopModule(MockOpenAI)
	const { withToolCallLoopSupport } = loopModule

	const wrappedFactory = withToolCallLoopSupport(() =>
		async function* () {
			yield 'fallback'
		},
	)

	const sendRequest = wrappedFactory({
		apiKey: 'test-key',
		baseURL: 'https://openrouter.ai/api/v1/chat/completions',
		model: 'openrouter/test-model',
		parameters: {},
		enableReasoning: true,
		tools: [{
			name: 'mock_tool',
			description: 'mock tool',
			inputSchema: { type: 'object', properties: {} },
			source: 'mcp',
			sourceId: 'mock-server',
		}],
		toolExecutor: {
			execute: async (call) => ({
				toolCallId: call.id,
				name: call.name,
				content: 'ok',
			}),
		},
	})

	const collectOutput = async (parts) => {
		streamQueue.push(parts)
		let output = ''
		for await (const chunk of sendRequest(
			[{ role: 'user', content: 'test question' }],
			new AbortController(),
			async () => new ArrayBuffer(0),
		)) {
			output += chunk
		}
		return output
	}

	{
		const output = await collectOutput([
			{ choices: [{ delta: { reasoning: '先分析问题' } }] },
			{ choices: [{ delta: { content: '最终答案A' } }] },
		])
		assert(
			output.includes('{{FF_REASONING_START}}') && output.includes(':{{FF_REASONING_END}}:'),
			'PR11-1: delta.reasoning should render reasoning block markers',
		)
		assert(output.includes('先分析问题'), 'PR11-1: delta.reasoning text should be streamed')
		assert(output.includes('最终答案A'), 'PR11-1: final answer should still be streamed')
	}

	{
		const output = await collectOutput([
			{
				choices: [{
					delta: {
						reasoning_details: [
							{ type: 'reasoning_text', text: '细节推理内容' },
							{ type: 'summary', summary_text: '摘要片段' },
						],
					},
				}],
			},
			{ choices: [{ delta: { content: '最终答案B' } }] },
		])
		assert(
			output.includes('{{FF_REASONING_START}}') && output.includes(':{{FF_REASONING_END}}:'),
			'PR11-2: delta.reasoning_details should render reasoning block markers',
		)
		assert(
			output.includes('细节推理内容') || output.includes('摘要片段'),
			'PR11-2: delta.reasoning_details should be converted to visible reasoning text',
		)
		assert(output.includes('最终答案B'), 'PR11-2: final answer should still be streamed')
	}
}

export const runPR12 = () => {
	const capabilityPath = path.resolve(PROVIDERS_ROOT, 'modelCapability.ts')
	const capabilityModule = loadTsModule(capabilityPath)
	const record = capabilityModule.resolveReasoningCapability({
		vendorName: 'Doubao',
		baseURL: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
		model: 'doubao-seed-2-0-pro-260215',
		cache: {},
	})
	assert(
		record.state === 'unknown',
		'PR12-1: Doubao model without explicit metadata/cached signal should default to unknown (optimistic allow)',
	)
	assert(
		record.source === 'default',
		'PR12-1: Doubao unknown capability should come from default source',
	)
}

export const runPR13 = async () => {
	const zhipuPath = path.resolve(PROVIDERS_ROOT, 'zhipu.ts')
	let capturedRequest = null

	class MockOpenAI {
		constructor() {
			this.chat = {
				completions: {
					create: async (request) => {
						capturedRequest = request
						return (async function* () {
							yield { choices: [{ delta: { content: 'ok' } }] }
						})()
					},
				},
			}
		}
	}

	const zhipuModule = loadTsModule(zhipuPath, {
		openai: MockOpenAI,
		'tars/lang/helper': { t: (text) => text },
		'.': {},
		'../mcp/mcpToolCallHandler': MCP_HANDLER_MOCK,
		'../../../utils/DebugLogger': { DebugLogger: { debug: () => {} } },
		'./utils': {
			buildReasoningBlockEnd: () => '',
			buildReasoningBlockStart: () => '',
		},
	})

	const sendRequest = zhipuModule.zhipuVendor.sendRequestFunc({
		apiKey: 'test-key',
		baseURL: 'https://open.bigmodel.cn/api/paas/v4/',
		model: 'glm-4.5-custom-new',
		enableWebSearch: false,
		enableReasoning: true,
		thinkingType: 'enabled',
		parameters: {},
	})

	for await (const _chunk of sendRequest(
		[{ role: 'user', content: 'test' }],
		new AbortController(),
		async () => new ArrayBuffer(0),
	)) {
		break
	}

	assert(capturedRequest !== null, 'PR13-1: Zhipu request should be sent')
	assert(
		capturedRequest?.thinking?.type === 'enabled',
		'PR13-1: Zhipu non-whitelist model should still send thinking when reasoning is enabled',
	)
}

export const runPR14 = () => {
	const capabilityPath = path.resolve(PROVIDERS_ROOT, 'modelCapability.ts')
	const capabilityModule = loadTsModule(capabilityPath)
	const supported = capabilityModule.inferReasoningCapabilityFromMetadata('OpenRouter', {
		id: 'openrouter/reasoning-model',
		supported_parameters: ['tools', 'reasoning', 'web_search'],
	})
	assert(
		supported?.state === 'supported',
		'PR14-1: OpenRouter metadata with supported_parameters.reasoning should be marked as supported',
	)

	const unsupported = capabilityModule.inferReasoningCapabilityFromMetadata('OpenRouter', {
		id: 'openrouter/non-reasoning-model',
		supported_parameters: ['tools', 'web_search'],
	})
	assert(
		unsupported?.state === 'unsupported',
		'PR14-1: OpenRouter metadata without reasoning in supported_parameters should be marked as unsupported',
	)
}

export const runPR15 = () => {
	const capabilityPath = path.resolve(PROVIDERS_ROOT, 'modelCapability.ts')
	const capabilityModule = loadTsModule(capabilityPath)
	const key = capabilityModule.buildReasoningCapabilityCacheKey(
		'OpenRouter',
		'https://openrouter.ai/api/v1/chat/completions',
		'openai/gpt-5',
	)

	const written = capabilityModule.writeReasoningCapabilityCache(
		{},
		key,
		{
			state: 'supported',
			source: 'probe',
			confidence: 0.8,
			checkedAt: 0,
		},
		1000,
		100,
	)
	const hit = capabilityModule.readReasoningCapabilityCache(written, key, 1050)
	assert(Boolean(hit), 'PR15-1: capability cache should hit before TTL expires')

	const miss = capabilityModule.readReasoningCapabilityCache(written, key, 1201)
	assert(miss === undefined, 'PR15-1: capability cache should miss after TTL expires')

	const pruned = capabilityModule.pruneExpiredReasoningCapabilityCache(written, 1201)
	assert(
		Object.keys(pruned).length === 0,
		'PR15-1: pruneExpiredReasoningCapabilityCache should remove expired entries',
	)
}

export const runPR16 = () => {
	const doubaoPath = path.resolve(PROVIDERS_ROOT, 'doubao.ts')
	let capturedTransformApiParams = null

	const doubaoModule = loadTsModule(doubaoPath, {
		obsidian: {
			requestUrl: async () => ({ status: 200, json: {}, text: '' }),
		},
		'tars/lang/helper': { t: (text) => text },
		'.': {},
		'./utils': {
			buildReasoningBlockEnd: () => '',
			buildReasoningBlockStart: () => '',
			convertEmbedToImageUrl: async () => ({ type: 'image_url', image_url: { url: '' } }),
			getMimeTypeFromFilename: () => 'image/png',
		},
		'./errors': {
			normalizeProviderError: (error) => error,
		},
		'./retry': {
			withRetry: async (operation) => operation(),
		},
		'src/core/agents/loop': {
			withToolCallLoopSupport: (factory, options) => {
				capturedTransformApiParams = options?.transformApiParams
				return factory
			},
		},
		'./doubaoImage': {
			DEFAULT_DOUBAO_IMAGE_OPTIONS: {
				displayWidth: 400,
				size: '1024x1024',
				response_format: 'b64_json',
				watermark: false,
				sequential_image_generation: false,
				stream: false,
				optimize_prompt_mode: 'auto',
			},
			doubaoImageVendor: {
				sendRequestFunc: () =>
					async function* () {
						yield ''
					},
			},
			DOUBAO_IMAGE_MODELS: [],
			isDoubaoImageGenerationModel: () => false,
		},
	})

	assert(
		doubaoModule.doubaoUseResponsesAPI({ enableReasoning: true, enableWebSearch: false }) === false,
		'PR16-1: Doubao reasoning-only mode should stay on chat.completions (MCP-compatible path)',
	)
	assert(
		doubaoModule.doubaoUseResponsesAPI({ enableReasoning: false, enableWebSearch: true }) === true,
		'PR16-1: Doubao web-search mode should use responses API',
	)
	assert(
		typeof capturedTransformApiParams === 'function',
		'PR16-2: Doubao MCP wrapper should provide transformApiParams',
	)

	const transformedEnabled = capturedTransformApiParams(
		{ temperature: 0.2, thinkingType: 'enabled' },
		{ enableReasoning: true, thinkingType: 'auto' },
	)
	assert(
		transformedEnabled.thinking?.type === 'auto',
		'PR16-2: Doubao MCP transform should map thinkingType to thinking.type when reasoning is enabled',
	)
	assert(
		transformedEnabled.thinkingType === undefined,
		'PR16-2: Doubao MCP transform should strip thinkingType from direct API params',
	)

	const transformedDisabled = capturedTransformApiParams(
		{ temperature: 0.2, thinkingType: 'enabled' },
		{ enableReasoning: false, thinkingType: 'enabled' },
	)
	assert(
		transformedDisabled.thinking === undefined,
		'PR16-2: Doubao MCP transform should not inject thinking when reasoning is disabled',
	)
}

export const runPR17 = async () => {
	const streamQueue = []

	class MockOpenAI {
		constructor() {
			this.chat = {
				completions: {
					create: async () => {
						const parts = streamQueue.shift()
						if (!parts) {
							throw new Error('PR17 mock stream queue is empty')
						}
						return (async function* () {
							for (const part of parts) {
								yield part
							}
						})()
					},
				},
			}
		}
	}

	const loopModule = loadAgentLoopModule(MockOpenAI)
	const { withToolCallLoopSupport } = loopModule

	const wrappedFactory = withToolCallLoopSupport(() =>
		async function* () {
			yield 'fallback'
		},
	)

	const sendRequest = wrappedFactory({
		apiKey: 'test-key',
		baseURL: 'https://qianfan.baidubce.com/v2/chat/completions',
		model: 'qwen3-235b-a22b',
		parameters: {},
		enableThinking: true,
		tools: [{
			name: 'mock_tool',
			description: 'mock tool',
			inputSchema: { type: 'object', properties: {} },
			source: 'mcp',
			sourceId: 'mock-server',
		}],
		toolExecutor: {
			execute: async (call) => ({
				toolCallId: call.id,
				name: call.name,
				content: 'ok',
			}),
		},
	})

	streamQueue.push([
		{ choices: [{ delta: { reasoning_content: '先思考' } }] },
		{ choices: [{ delta: { content: '最终答案' } }] },
	])

	let output = ''
	for await (const chunk of sendRequest(
		[{ role: 'user', content: 'test question' }],
		new AbortController(),
		async () => new ArrayBuffer(0),
	)) {
		output += chunk
	}

	assert(
		output.includes('{{FF_REASONING_START}}') && output.includes(':{{FF_REASONING_END}}:'),
		'PR17-1: MCP reasoning display should honor enableThinking for QianFan-like providers',
	)
	assert(output.includes('先思考'), 'PR17-1: reasoning_content should be streamed when enableThinking is true')
	assert(output.includes('最终答案'), 'PR17-1: normal content should still be streamed')
}

export const runPR18 = () => {
	const qianFanPath = path.resolve(PROVIDERS_ROOT, 'qianFan.ts')
	let capturedTransformApiParams = null
	loadTsModule(qianFanPath, {
		openai: class MockOpenAI {},
		obsidian: {
			Notice: class {},
			requestUrl: async () => ({ status: 200, json: {}, text: '', arrayBuffer: new ArrayBuffer(0) }),
		},
		'tars/lang/helper': { t: (text) => text },
		'.': {},
		'src/core/agents/loop': {
			withToolCallLoopSupport: (factory, options) => {
				capturedTransformApiParams = options?.transformApiParams
				return factory
			},
		},
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
		typeof capturedTransformApiParams === 'function',
		'PR18-1: QianFan MCP wrapper should provide transformApiParams',
	)

	const transformed = capturedTransformApiParams(
		{ temperature: 0.2, enableThinking: true },
		{ enableThinking: true },
	)
	assert(
		transformed.enable_thinking === true,
		'PR18-1: QianFan MCP transform should map enableThinking to enable_thinking',
	)
	assert(
		transformed.enableThinking === undefined,
		'PR18-1: QianFan MCP transform should strip enableThinking from direct API params',
	)

	const settingTabSource = fs.readFileSync(SETTINGS_PANEL_PATH, 'utf-8')
	assert(
		/\[kimiVendor\.name\][\s\S]*Authorization:\s*`Bearer \$\{options\.apiKey\}`/.test(settingTabSource),
		'PR18-2: Kimi model fetch request should include Authorization header',
	)
}
