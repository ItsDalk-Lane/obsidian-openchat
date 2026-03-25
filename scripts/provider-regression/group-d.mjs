import { fs, path, assert, CHAT_SERVICE_PATH, loadAgentLoopModule, loadTsModule, PROVIDERS_ROOT } from './shared.mjs'

export const runPR19 = async () => {
	class MockOpenAI {
		constructor() {
			this.chat = {
				completions: {
					create: async () => {
						throw new Error('Connection error.')
					},
				},
			}
		}
	}

	const loopModule = loadAgentLoopModule(MockOpenAI)
	const { withToolCallLoopSupport } = loopModule
	const wrappedFactory = withToolCallLoopSupport(() =>
		async function* () {
			yield 'fallback-success'
		},
	)

	const sendRequest = wrappedFactory({
		apiKey: 'test-key',
		baseURL: 'https://api.moonshot.cn/v1/chat/completions',
		model: 'kimi-k2',
		parameters: {},
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

	let output = ''
	for await (const chunk of sendRequest(
		[{ role: 'user', content: 'test question' }],
		new AbortController(),
		async () => new ArrayBuffer(0),
	)) {
		output += chunk
	}

	assert(
		output.includes('fallback-success'),
		'PR19-1: Kimi MCP connection error should fallback to plain request path',
	)
}

export const runPR20 = async () => {
	const streamQueue = []

	class MockOpenAI {
		constructor() {
			this.chat = {
				completions: {
					create: async () => {
						const parts = streamQueue.shift()
						if (!parts) {
							throw new Error('PR20 mock stream queue is empty')
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
		baseURL: 'https://api.moonshot.cn/v1/chat/completions',
		model: 'kimi-k2',
		parameters: {},
		tools: [{
			name: 'list_directory',
			description: 'list files',
			inputSchema: {
				type: 'object',
				required: ['directory_path'],
				properties: {
					directory_path: { type: 'string' },
				},
			},
			source: 'mcp',
			sourceId: 'mock-server',
		}],
		toolExecutor: {
			execute: async (call) => ({
				toolCallId: call.id,
				name: call.name,
				content: 'tool-result',
			}),
		},
	})

	streamQueue.push([
		{ choices: [{ delta: { function_call: { name: 'list_directory' } } }] },
		{ choices: [{ delta: { function_call: { arguments: '{"directory_path":"Inbox"}' } } }] },
	])
	streamQueue.push([
		{ choices: [{ delta: { content: '最终总结' } }] },
	])

	let output = ''
	for await (const chunk of sendRequest(
		[{ role: 'user', content: 'summarize inbox' }],
		new AbortController(),
		async () => new ArrayBuffer(0),
	)) {
		output += chunk
	}

	assert(
		output.includes('{{FF_MCP_TOOL_START}}:list_directory:tool-result{{FF_MCP_TOOL_END}}:'),
		'PR20-1: legacy function_call should still execute MCP tools',
	)
	assert(
		output.includes('最终总结'),
		'PR20-2: response should continue after legacy function_call tool execution',
	)
}

export const runPR21 = () => {
	const kimiPath = path.resolve(PROVIDERS_ROOT, 'kimi.ts')
	let capturedMcpOptions = null

	loadTsModule(kimiPath, {
		axios: {
			post: async () => {
				throw new Error('not implemented in regression test')
			},
		},
		openai: class MockOpenAI {
			constructor(opts) {
				this._opts = opts
			}
		},
		'tars/lang/helper': { t: (text) => text },
		'.': {},
		'src/core/agents/loop': {
			withToolCallLoopSupport: (factory, options) => {
				capturedMcpOptions = options
				return factory
			},
		},
		'./utils': {
			buildReasoningBlockEnd: () => '',
			buildReasoningBlockStart: () => '',
			convertEmbedToImageUrl: async () => ({ type: 'image_url', image_url: { url: '' } }),
		},
		'./sse': {
			feedChunk: () => ({ events: [], rest: '', done: false }),
		},
	})

	assert(Boolean(capturedMcpOptions), 'PR21-1: Kimi MCP wrapper options should be captured')
	assert(
		capturedMcpOptions.preferNonStreamingToolLoop !== true,
		'PR21-1: Kimi MCP wrapper should use streaming tool loop (Moonshot recommends stream=true for thinking models)',
	)
	assert(
		typeof capturedMcpOptions.createClient === 'function',
		'PR21-1: Kimi MCP wrapper should provide a custom createClient to strip non-standard SDK headers',
	)

	const transformed = capturedMcpOptions.transformApiParams(
		{ temperature: 0.7, enableThinking: false, enableWebSearch: false },
		{ enableReasoning: true, mcpTools: [{ name: 'list_directory' }] },
	)
	assert(
		transformed.tool_choice === 'auto',
		'PR21-1: Kimi MCP params should include tool_choice=auto by default',
	)
	assert(
		typeof transformed.max_tokens === 'number' && transformed.max_tokens >= 16000,
		'PR21-1: Kimi MCP reasoning requests should enforce max_tokens >= 16000',
	)
	assert(
		transformed.temperature === 1.0,
		'PR21-1: Kimi MCP reasoning requests should enforce temperature=1.0 per Moonshot docs',
	)
	assert(
		transformed.enableThinking === undefined && transformed.enableWebSearch === undefined,
		'PR21-1: Kimi MCP params should strip non-standard fields (enableThinking, enableWebSearch)',
	)

	const chatServiceSource = fs.readFileSync(CHAT_SERVICE_PATH, 'utf-8')
	assert(
		/session\.messages\s*=\s*session\.messages\.slice\(0,\s*index\)/.test(chatServiceSource),
		'PR21-2: regenerateFromMessage should truncate the target assistant message and all following messages',
	)
}

export const runPR22 = async () => {
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

	const loopModule = loadAgentLoopModule(MockOpenAI)
	const { withToolCallLoopSupport } = loopModule
	const wrappedFactory = withToolCallLoopSupport(() =>
		async function* () {
			yield 'fallback'
		},
	)
	const sendRequest = wrappedFactory({
		apiKey: 'test-key',
		baseURL: 'https://api.moonshot.cn/v1/chat/completions',
		model: 'kimi-k2-thinking',
		parameters: {
			tools: [],
			stream: false,
			model: 'malicious-override',
		},
		tools: [{
			name: 'list_directory',
			description: 'list files',
			inputSchema: {
				type: 'object',
				required: ['directory_path'],
				properties: {
					directory_path: { type: 'string' },
				},
			},
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

	for await (const _chunk of sendRequest(
		[{ role: 'user', content: 'test question' }],
		new AbortController(),
		async () => new ArrayBuffer(0),
	)) {
		break
	}

	assert(Boolean(capturedRequest), 'PR22-1: MCP request payload should be captured')
	assert(
		Array.isArray(capturedRequest.tools) && capturedRequest.tools.length === 1,
		'PR22-1: injected MCP tools should not be overridden by parameters.tools',
	)
	assert(
		capturedRequest.model === 'kimi-k2-thinking',
		'PR22-1: request model should not be overridden by parameters.model',
	)
	assert(
		capturedRequest.stream === true,
		'PR22-1: stream mode should not be overridden by parameters.stream',
	)
}

export const runPR23 = async () => {
	const ollamaPath = path.resolve(PROVIDERS_ROOT, 'ollama.ts')
	let capturedHost = null
	const capturedRequests = []
	const streamQueue = []

	class MockOllama {
		constructor(options = {}) {
			capturedHost = options.host ?? null
		}

		async chat(request) {
			capturedRequests.push(JSON.parse(JSON.stringify(request)))
			return streamQueue.shift() ?? (async function* () {})()
		}

		abort() {}
	}

	const ollamaModuleMocks = {
		'ollama/browser': {
			Ollama: MockOllama,
		},
		obsidian: {},
		'tars/lang/helper': { t: (text) => text },
		'.': {},
		'src/core/agents/loop': {
			resolveCurrentTools: async (tools) => tools,
			toOpenAITools: (tools) => tools,
		},
		'./errors': {
			normalizeProviderError: (error) => error,
		},
		'./utils': {
			arrayBufferToBase64: () => 'ZmFrZQ==',
			getMimeTypeFromFilename: () => 'image/png',
			buildReasoningBlockStart: () => '',
			buildReasoningBlockEnd: () => '',
		},
	}

	const { ollamaVendor } = loadTsModule(ollamaPath, ollamaModuleMocks)

	const makeStream = (parts) => (async function* () {
		for (const part of parts) {
			yield part
		}
	})()

	streamQueue.push(makeStream([
		{ message: { content: '先查一下' } },
		{
			message: {
				content: '',
				tool_calls: [{
					function: {
						name: 'list_directory',
						arguments: { directory_path: 'Inbox' },
					},
				}],
			},
		},
	]))
	streamQueue.push(makeStream([
		{ message: { content: '最终总结' } },
	]))

	const sendRequest = ollamaVendor.sendRequestFunc({
		apiKey: '',
		baseURL: 'http://127.0.0.1:11434',
		model: 'llama3.1',
		parameters: {},
		enableReasoning: false,
		tools: [{
			name: 'list_directory',
			description: 'list files',
			inputSchema: {
				type: 'object',
				required: ['directory_path'],
				properties: {
					directory_path: { type: 'string' },
				},
			},
			source: 'mcp',
			sourceId: 'mock-server',
		}],
		toolExecutor: {
			execute: async (call) => {
				const args = JSON.parse(call.arguments)
				return {
					toolCallId: call.id,
					name: call.name,
					content: args.directory_path === 'Inbox' ? 'tool-result' : 'unexpected',
				}
			},
		},
	})

	let output = ''
	for await (const chunk of sendRequest(
		[{ role: 'user', content: 'summarize inbox' }],
		new AbortController(),
		async () => new ArrayBuffer(0),
	)) {
		output += chunk
	}

	assert(
		capturedHost === 'http://127.0.0.1:11434',
		'PR23-1: Ollama MCP path should keep the native host and not rewrite to /v1',
	)
	assert(
		Array.isArray(capturedRequests[0]?.tools) && capturedRequests[0].tools.length === 1,
		'PR23-2: first native Ollama MCP request should include tools',
	)
	assert(
		output.includes('先查一下'),
		'PR23-3: native Ollama MCP path should stream assistant text before tool execution',
	)
	assert(
		output.includes('{{FF_MCP_TOOL_START}}:list_directory:tool-result{{FF_MCP_TOOL_END}}:'),
		'PR23-4: native Ollama MCP path should execute tools and emit MCP tool markers',
	)
	assert(
		output.includes('最终总结'),
		'PR23-5: native Ollama MCP path should continue with the second round response after tool execution',
	)
	const secondRoundMessages = capturedRequests[1]?.messages ?? []
	const toolMessage = secondRoundMessages.find((message) => message.role === 'tool')
	assert(
		toolMessage?.tool_name === 'list_directory' && toolMessage?.content === 'tool-result',
		'PR23-6: second native Ollama request should feed tool results back with role=tool and tool_name',
	)
}
