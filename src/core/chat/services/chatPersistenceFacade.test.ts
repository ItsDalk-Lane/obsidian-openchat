import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_CHAT_SETTINGS } from 'src/domains/chat/config'
import {
	createChatPersistenceFacade,
} from './chat-persistence-facade'
import type { ChatPersistenceDeps } from './chat-settings-persistence'
import type { ChatSettings } from '../types/chat'

const createPersistenceDeps = (
	chatSettings: ChatSettings,
	layoutModeStorageKey: string,
): ChatPersistenceDeps => ({
	settingsAccessor: {
		getManifestId: () => 'openchat',
		getAiDataFolder: () => 'System/AI Data',
		getPluginSettings: () => null as never,
		getChatSettings: () => chatSettings,
		setChatSettings: () => {},
		getAiRuntimeSettings: () => null as never,
		setAiRuntimeSettings: () => {},
		saveSettings: async () => {},
		openSettingsTab: () => {},
	},
	obsidianApi: {
		notify: () => {},
		readLocalStorage: () => null,
		writeLocalStorage: () => {},
	},
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
				capturedRecentTurns = deps.settingsAccessor.getChatSettings().messageManagement.recentTurns
			},
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
