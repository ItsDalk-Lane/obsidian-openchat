import assert from 'node:assert/strict'
import Module from 'node:module'
import test from 'node:test'
import type { SkillReturnPacket } from 'src/domains/skills/session-state'
import {
	createChatCommandFacade,
} from './chat-command-facade'
import type {
	ExecuteSkillCommandParams,
	ExecuteSubAgentCommandParams,
} from './chat-commands'

const ensureWindowLocalStorage = (): void => {
	const globalScope = globalThis as typeof globalThis & {
		window?: Window & typeof globalThis
	}
	const localStorage: Storage = {
		length: 0,
		clear: () => {},
		getItem: () => 'en',
		key: () => null,
		removeItem: () => {},
		setItem: () => {},
	}
	globalScope.window = {
		...(globalScope.window ?? ({} as Window & typeof globalThis)),
		localStorage,
	} as Window & typeof globalThis
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
	obsidianApi: { notify: () => {} },
	executeSkillExecution: async () => ({
		invocationId: 'invoke-1',
		skillId: 'skills/skill-a/SKILL.md',
		skillName: inputValue,
		status: 'completed',
		content: 'skill-result',
		sessionId: 'chat-main',
		messageCount: 2,
		producedAt: 1,
		metadata: { executionMode: 'inline' },
	}),
	saveSkillExecutionResult: async () => {},
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
	let capturedSkillName: string | undefined
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
			executeSkillCommand: async (params, skillName) => {
				capturedSkillName = skillName
				await params.executeSkillExecution({ skillName, trigger: 'slash_command' })
			},
			executeSubAgentCommand: async (params) => {
				capturedProviderCount = params.providers.length
				capturedSelectedModelId = params.state.selectedModelId
			},
		},
	)

	await facade.executeSkillCommand('skill-a')
	assert.equal(capturedSkillName, 'skill-a')

	inputValue = 'skill-b'
	providerCount = 3
	selectedModelId = 'model-b'
	await facade.executeSkillCommand('skill-b')
	await facade.executeSubAgentCommand('agent-b')

	assert.equal(capturedSkillName, 'skill-b')
	assert.equal(capturedProviderCount, 3)
	assert.equal(capturedSelectedModelId, 'model-b')
	assert.equal(skillGetterCalls, 2)
	assert.equal(subAgentGetterCalls, 1)
})

test('executeSkillCommand slash 会通过统一执行器执行 inline Skill', async () => {
	ensureWindowLocalStorage()
	installObsidianStub()
	const { executeSkillCommand } = await import('./chat-commands')
	const requests: Array<{ skillName: string; trigger?: string }> = []
	let appliedPacket = false

	await executeSkillCommand(
		{
			obsidianApi: {
				notify: () => {},
			},
			executeSkillExecution: async (request) => {
				requests.push({
					skillName: request.skillName,
					trigger: request.trigger,
				})
				return {
					invocationId: 'invoke-1',
					skillId: 'skills/skill-a/SKILL.md',
					skillName: 'skill-a',
					status: 'completed',
					content: 'inline-result',
					sessionId: 'chat-main',
					messageCount: 2,
					producedAt: 1,
					metadata: { executionMode: 'inline' },
				}
			},
			saveSkillExecutionResult: async () => {
				appliedPacket = true
			},
		},
		'skill-a',
	)

	assert.deepEqual(requests, [{ skillName: 'skill-a', trigger: 'slash_command' }])
	assert.equal(appliedPacket, false)
})

test('executeSkillCommand slash 会把非 inline Skill 返回包写回主任务', async () => {
	ensureWindowLocalStorage()
	installObsidianStub()
	const { executeSkillCommand } = await import('./chat-commands')
	const appliedPackets: SkillReturnPacket[] = []

	await executeSkillCommand(
		{
			obsidianApi: {
				notify: () => {},
			},
			executeSkillExecution: async () => ({
				invocationId: 'invoke-2',
				skillId: 'skills/skill-b/SKILL.md',
				skillName: 'skill-b',
				status: 'completed',
				content: 'isolated-result',
				sessionId: 'chat-skill',
				messageCount: 2,
				producedAt: 2,
				metadata: { executionMode: 'isolated_resume' },
			}),
			saveSkillExecutionResult: async (packet) => {
				appliedPackets.push(packet)
			},
		},
		'skill-b',
	)

	assert.equal(appliedPackets.length, 1)
	assert.equal(appliedPackets[0]?.content, 'isolated-result')
})
