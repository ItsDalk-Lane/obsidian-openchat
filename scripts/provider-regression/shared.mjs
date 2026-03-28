import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { createScriptLogger } from '../script-logger.mjs'

export { fs, path }

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const PROVIDERS_ROOT = path.resolve(ROOT, 'src/LLMProviders')
export const SETTINGS_PANEL_PATH = path.resolve(
	ROOT,
	'src/components/settings-components/AiRuntimeSettingsPanel.ts',
)
export const MCP_HANDLER_PATH = path.resolve(ROOT, 'src/services/mcp/mcpToolCallHandler.ts')
export const AGENT_LOOP_HANDLER_PATH = path.resolve(
	ROOT,
	'src/core/agents/loop/OpenAILoopHandler.ts',
)
export const CHAT_SERVICE_PATH = path.resolve(ROOT, 'src/core/chat/services/chat-service.ts')

const I18N_HELPER_MOCK = { t: (text) => text }
const DEBUG_LOGGER_MOCK = {
	DebugLogger: {
		debug: () => {},
		info: () => {},
		log: () => {},
		warn: () => {},
		error: () => {},
	},
}

const TOOL_LOOP_MOCK = {
	withToolCallLoopSupport: (factory) => factory,
	withClaudeToolCallLoopSupport: (factory) => factory,
}

const DEFAULT_MOCKS = {
	'src/i18n/ai-runtime/helper': I18N_HELPER_MOCK,
	'tars/lang/helper': I18N_HELPER_MOCK,
	'src/utils/DebugLogger': DEBUG_LOGGER_MOCK,
	'../../../utils/DebugLogger': DEBUG_LOGGER_MOCK,
	'../utils/DebugLogger': DEBUG_LOGGER_MOCK,
	'./DebugLogger': DEBUG_LOGGER_MOCK,
	'src/core/agents/loop': TOOL_LOOP_MOCK,
}

export const logger = createScriptLogger('provider-regression')

export const parseArgs = () => {
	const matched = process.argv.find((arg) => arg.startsWith('--pr='))
	if (!matched) return 1
	const parsed = Number.parseInt(matched.slice('--pr='.length), 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export const loadTsModule = (filePath, mocks = {}) => {
	const source = fs.readFileSync(filePath, 'utf-8')
	const compiled = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2018,
			esModuleInterop: true,
		},
	}).outputText
	const module = { exports: {} }
	const context = vm.createContext({
		module,
		exports: module.exports,
		require: (id) => {
			if (Object.prototype.hasOwnProperty.call(mocks, id)) {
				return mocks[id]
			}
			if (id === 'src/services/mcp/mcpToolCallHandler') {
				return MCP_HANDLER_MOCK
			}
			if (Object.prototype.hasOwnProperty.call(DEFAULT_MOCKS, id)) {
				return DEFAULT_MOCKS[id]
			}
			throw new Error(`Unsupported require in regression script: ${id}`)
		},
		console,
		setTimeout,
		clearTimeout,
		AbortController,
		URL,
		Buffer,
	})
	new vm.Script(compiled, { filename: filePath }).runInContext(context)
	return module.exports
}

export const assert = (condition, message) => {
	if (!condition) {
		throw new Error(message)
	}
}

export const MCP_HANDLER_MOCK = {
	withOpenAIMcpToolCallSupport: (factory) => factory,
	toOpenAITools: (tools) => tools,
	executeMcpToolCalls: async () => [],
}

const AGENT_LOOP_UTILS_MOCK = {
	convertEmbedToImageUrl: async () => ({ type: 'image_url', image_url: { url: '' } }),
	REASONING_BLOCK_START_MARKER: '{{FF_REASONING_START}}',
	REASONING_BLOCK_END_MARKER: '{{FF_REASONING_END}}',
}

export const loadAgentLoopModule = (MockOpenAI, extraMocks = {}) => loadTsModule(
	AGENT_LOOP_HANDLER_PATH,
	{
		openai: MockOpenAI,
		obsidian: { Notice: class {} },
		'src/utils/DebugLogger': DEBUG_LOGGER_MOCK,
		'src/types/provider': {},
		'src/LLMProviders/utils': AGENT_LOOP_UTILS_MOCK,
		...extraMocks,
	},
)
