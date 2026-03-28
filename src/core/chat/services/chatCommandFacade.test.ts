import assert from 'node:assert/strict'
import test from 'node:test'
import {
	createChatCommandFacade,
} from './chat-command-facade'
import type {
	ExecuteSkillCommandParams,
	ExecuteSubAgentCommandParams,
} from './chat-commands'

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
