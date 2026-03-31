import assert from 'node:assert/strict'
import Module from 'node:module'
import test from 'node:test'
import {
	createChatCommandFacade,
} from './chat-command-facade'
import type {
	ExecuteSkillCommandParams,
	ExecuteSubAgentCommandParams,
} from './chat-commands'

const ensureWindowLocalStorage = (): void => {
	const globalScope = globalThis as typeof globalThis & {
		window?: { localStorage?: { getItem: (key: string) => string | null } }
	}
	globalScope.window = {
		...(globalScope.window ?? {}),
		localStorage: {
			getItem: () => 'en',
		},
	}
}

const installObsidianStub = (): void => {
	const globalScope = globalThis as typeof globalThis & {
		__obsidianStubInstalled?: boolean
	}
	if (globalScope.__obsidianStubInstalled) {
		return
	}
	const moduleLoader = Module as typeof Module & {
		_load: (request: string, parent: object | null, isMain: boolean) => unknown
	}
	const originalLoad = moduleLoader._load
	moduleLoader._load = (request, parent, isMain) => {
		if (request === 'obsidian') {
			return {}
		}
		return originalLoad(request, parent, isMain)
	}
	globalScope.__obsidianStubInstalled = true
}

const createSkillParams = (inputValue: string): ExecuteSkillCommandParams => ({
	obsidianApi: null as never,
	state: { inputValue } as never,
	emitState: () => {},
	loadInstalledSkills: async () => null as never,
	sendMessage: async () => {},
})

const createSubAgentParams = (
	providerCount: number,
	selectedModelId: string | null,
): ExecuteSubAgentCommandParams => ({
	state: { selectedModelId } as never,
	notify: () => {},
	providers: Array.from({ length: providerCount }, (_, index) => ({
		tag: `provider-${index}`,
	})) as never,
	loadInstalledSubAgents: async () => null as never,
	prepareChatRequest: async () => null,
	ensurePlanSyncReady: async () => {},
	resolveProvider: () => null,
	getDefaultProviderTag: () => selectedModelId,
	generateAssistantResponseForModel: async () => undefined,
	emitState: () => {},
})

test('createChatCommandFacade 每次调用都读取最新 deps', async () => {
	let inputValue = 'skill-a'
	let providerCount = 1
	let selectedModelId: string | null = 'model-a'
	let skillGetterCalls = 0
	let subAgentGetterCalls = 0
	let capturedInputValue: string | undefined
	let capturedProviderCount: number | undefined
	let capturedSelectedModelId: string | null | undefined

	const facade = createChatCommandFacade(
		{
			getExecuteSkillCommandParams: () => {
				skillGetterCalls += 1
				return createSkillParams(inputValue)
			},
			getExecuteSubAgentCommandParams: () => {
				subAgentGetterCalls += 1
				return createSubAgentParams(providerCount, selectedModelId)
			},
		},
		{
			executeSkillCommand: async (params) => {
				capturedInputValue = params.state.inputValue
			},
			executeSubAgentCommand: async (params) => {
				capturedProviderCount = params.providers.length
				capturedSelectedModelId = params.state.selectedModelId
			},
		},
	)

	await facade.executeSkillCommand('skill-a')
	assert.equal(capturedInputValue, 'skill-a')

	inputValue = 'skill-b'
	providerCount = 3
	selectedModelId = 'model-b'
	await facade.executeSkillCommand('skill-b')
	await facade.executeSubAgentCommand('agent-b')

	assert.equal(capturedInputValue, 'skill-b')
	assert.equal(capturedProviderCount, 3)
	assert.equal(capturedSelectedModelId, 'model-b')
	assert.equal(skillGetterCalls, 2)
	assert.equal(subAgentGetterCalls, 1)
})

test('executeSkillCommand 选择模板后不再切换模板系统提示词标记', async () => {
	ensureWindowLocalStorage()
	installObsidianStub()
	const { executeSkillCommand } = await import('./chat-commands')
	const sentMessages: string[] = []
	const state = {
		inputValue: 'old input',
	} as ExecuteSkillCommandParams['state']

	await executeSkillCommand(
		{
			obsidianApi: {
				getVaultEntry: () => ({
					kind: 'file',
					path: 'AI Prompts/skill-a.md',
					name: 'skill-a.md',
				}),
				notify: () => {},
				readVaultFile: async () => '请审查下面的实现',
			},
			state,
			emitState: () => {},
			loadInstalledSkills: async () => ({
				skills: [{
					metadata: { name: 'skill-a' },
					skillFilePath: 'AI Prompts/skill-a.md',
				}],
			}) as never,
			sendMessage: async (content) => {
				sentMessages.push(content ?? '')
			},
		},
		'skill-a',
	)

	assert.equal(state.selectedPromptTemplate?.name, 'skill-a')
	assert.equal(state.selectedPromptTemplate?.content, '请审查下面的实现')
	assert.equal(state.inputValue, '')
	assert.deepEqual(sentMessages, [''])
})
