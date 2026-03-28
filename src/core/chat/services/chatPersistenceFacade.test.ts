import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_CHAT_SETTINGS } from 'src/domains/chat/config'
import {
	createChatPersistenceFacade,
} from './chatPersistenceFacade'
import type { ChatPersistenceDeps } from './chatSettingsPersistence'
import type { ChatSettings } from '../types/chat'

const createPersistenceDeps = (
	chatSettings: ChatSettings,
	layoutModeStorageKey: string,
): ChatPersistenceDeps => ({
	plugin: {
		settings: {
			chat: chatSettings,
			aiRuntime: null,
		},
	} as never,
	runtimeDeps: null as never,
	state: {
		layoutMode: 'horizontal',
		activeSession: null,
	} as never,
	sessionManager: null as never,
	toolRuntimeResolver: null as never,
	getDefaultProviderTag: () => null,
	updateSettings: () => {},
	bindLivePlanStateSync: () => {},
	queueSessionPlanSync: () => {},
	persistSessionContextCompactionFrontmatter: async () => {},
	saveActiveSession: async () => {},
	layoutModeStorageKey,
})

test('createChatPersistenceFacade 每次调用都读取最新 deps', async () => {
	let chatSettings: ChatSettings = {
		...DEFAULT_CHAT_SETTINGS,
		messageManagement: {
			...DEFAULT_CHAT_SETTINGS.messageManagement,
			recentTurns: 2,
		},
	}
	let layoutModeStorageKey = 'layout-a'
	let getterCalls = 0
	let capturedRecentTurns: number | undefined
	let capturedStorageKey: string | undefined

	const facade = createChatPersistenceFacade(
		() => {
			getterCalls += 1
			return createPersistenceDeps(chatSettings, layoutModeStorageKey)
		},
		{
			persistChatSettings: async (deps) => {
				capturedRecentTurns = deps.plugin.settings.chat.messageManagement.recentTurns
			},
			persistGlobalSystemPromptsEnabled: async () => {},
			persistMcpSettings: async () => {},
			rewriteSessionMessages: async () => {},
			readPersistedLayoutMode: (deps) => {
				capturedStorageKey = deps.layoutModeStorageKey
				return null
			},
			persistLayoutMode: (deps) => {
				capturedStorageKey = deps.layoutModeStorageKey
			},
			syncSessionMultiModelState: () => {},
			persistActiveSessionMultiModelFrontmatter: async () => {},
			persistSessionMultiModelFrontmatter: async () => {},
			restoreMultiModelStateFromSession: () => ({
				multiModelMode: 'single',
				selectedModels: [],
				layoutMode: 'horizontal',
			}),
		},
	)

	await facade.persistChatSettings({})
	assert.equal(capturedRecentTurns, 2)

	chatSettings = {
		...chatSettings,
		messageManagement: {
			...chatSettings.messageManagement,
			recentTurns: 6,
		},
	}
	layoutModeStorageKey = 'layout-b'
	await facade.persistChatSettings({})
	facade.readPersistedLayoutMode()
	facade.persistLayoutMode('tabs')

	assert.equal(capturedRecentTurns, 6)
	assert.equal(capturedStorageKey, 'layout-b')
	assert.equal(getterCalls, 4)
})