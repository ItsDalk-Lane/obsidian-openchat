import type { McpSettings } from 'src/types/mcp'
import type { ChatPersistenceDeps } from './chat-settings-persistence'
import type { ChatSession, ChatSettings } from '../types/chat'
import type { LayoutMode, MultiModelMode } from '../types/multiModel'

export interface ChatPersistenceFacade {
	persistChatSettings(partial: Partial<ChatSettings>): Promise<void>
	persistGlobalSystemPromptsEnabled(enabled: boolean): Promise<void>
	persistMcpSettings(mcpSettings: McpSettings): Promise<void>
	rewriteSessionMessages(session: ChatSession): Promise<void>
	readPersistedLayoutMode(): LayoutMode | null
	persistLayoutMode(mode: LayoutMode): void
	syncSessionMultiModelState(session?: ChatSession | null): void
	persistActiveSessionMultiModelFrontmatter(): Promise<void>
	persistSessionMultiModelFrontmatter(session: ChatSession): Promise<void>
	restoreMultiModelStateFromSession(session: ChatSession): {
		multiModelMode: MultiModelMode
		selectedModels: string[]
		layoutMode: LayoutMode
	}
}

export interface ChatPersistenceFacadeOperations {
	persistChatSettings(
		deps: ChatPersistenceDeps,
		partial: Partial<ChatSettings>,
	): Promise<void>
	persistGlobalSystemPromptsEnabled(
		deps: ChatPersistenceDeps,
		enabled: boolean,
	): Promise<void>
	persistMcpSettings(
		deps: ChatPersistenceDeps,
		mcpSettings: McpSettings,
	): Promise<void>
	rewriteSessionMessages(
		deps: ChatPersistenceDeps,
		session: ChatSession,
	): Promise<void>
	readPersistedLayoutMode(deps: ChatPersistenceDeps): LayoutMode | null
	persistLayoutMode(deps: ChatPersistenceDeps, mode: LayoutMode): void
	syncSessionMultiModelState(
		deps: ChatPersistenceDeps,
		session?: ChatSession | null,
	): void
	persistActiveSessionMultiModelFrontmatter(
		deps: ChatPersistenceDeps,
	): Promise<void>
	persistSessionMultiModelFrontmatter(
		deps: ChatPersistenceDeps,
		session: ChatSession,
	): Promise<void>
	restoreMultiModelStateFromSession(
		deps: ChatPersistenceDeps,
		session: ChatSession,
	): {
		multiModelMode: MultiModelMode
		selectedModels: string[]
		layoutMode: LayoutMode
	}
}

type ChatPersistenceDepsAccessor = () => ChatPersistenceDeps

export const createChatPersistenceFacade = (
	getDeps: ChatPersistenceDepsAccessor,
	operations: ChatPersistenceFacadeOperations,
): ChatPersistenceFacade => ({
	persistChatSettings: async (partial) =>
		await operations.persistChatSettings(getDeps(), partial),
	persistGlobalSystemPromptsEnabled: async (enabled) =>
		await operations.persistGlobalSystemPromptsEnabled(getDeps(), enabled),
	persistMcpSettings: async (mcpSettings) =>
		await operations.persistMcpSettings(getDeps(), mcpSettings),
	rewriteSessionMessages: async (session) =>
		await operations.rewriteSessionMessages(getDeps(), session),
	readPersistedLayoutMode: () => operations.readPersistedLayoutMode(getDeps()),
	persistLayoutMode: (mode) => operations.persistLayoutMode(getDeps(), mode),
	syncSessionMultiModelState: (session) =>
		operations.syncSessionMultiModelState(getDeps(), session),
	persistActiveSessionMultiModelFrontmatter: async () =>
		await operations.persistActiveSessionMultiModelFrontmatter(getDeps()),
	persistSessionMultiModelFrontmatter: async (session) =>
		await operations.persistSessionMultiModelFrontmatter(getDeps(), session),
	restoreMultiModelStateFromSession: (session) =>
		operations.restoreMultiModelStateFromSession(getDeps(), session),
})