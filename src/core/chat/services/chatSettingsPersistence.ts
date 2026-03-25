import { Notice } from 'obsidian';
import { localInstance } from 'src/i18n/locals';
import { normalizeMessageManagementSettings } from '../types/chat';
import { syncToolExecutionSettings, type AiRuntimeSettings } from 'src/settings/ai-runtime';
import { DebugLogger } from 'src/utils/DebugLogger';
import type OpenChatPlugin from 'src/main';
import type { McpSettings } from 'src/services/mcp';
import type { ChatRuntimeDeps } from '../runtime/ChatRuntimeDeps';
import type { ChatSessionManager } from './ChatSessionManager';
import type { ChatToolRuntimeResolver } from './ChatToolRuntimeResolver';
import type { ChatSession, ChatSettings, ChatState } from '../types/chat';
import type { LayoutMode, MultiModelMode } from '../types/multiModel';

interface ChatPersistenceDeps {
	plugin: OpenChatPlugin;
	runtimeDeps: ChatRuntimeDeps;
	state: ChatState;
	sessionManager: ChatSessionManager;
	toolRuntimeResolver: ChatToolRuntimeResolver;
	getDefaultProviderTag: () => string | null;
	updateSettings: (settings: Partial<ChatSettings>) => void;
	bindLivePlanStateSync: () => void;
	queueSessionPlanSync: (session: ChatSession | null) => void;
	persistSessionContextCompactionFrontmatter: (
		session: ChatSession
	) => Promise<void>;
	saveActiveSession: () => Promise<void>;
	layoutModeStorageKey: string;
}

export const cloneValue = <T>(value: T): T =>
	JSON.parse(JSON.stringify(value)) as T;

export const handleSettingsSaveError = (error: unknown): void => {
	const message = error instanceof Error ? error.message : String(error);
	new Notice(`${localInstance.chat_settings_save_failed}: ${message}`);
};

export const persistChatSettings = async (
	deps: ChatPersistenceDeps,
	partial: Partial<ChatSettings>
): Promise<void> => {
	const previousChatSettings = cloneValue(deps.plugin.settings.chat);
	const nextMessageManagement = normalizeMessageManagementSettings({
		...(deps.plugin.settings.chat.messageManagement ?? {}),
		...(partial.messageManagement ?? {}),
	});
	const nextChatSettings = {
		...deps.plugin.settings.chat,
		...partial,
		messageManagement: nextMessageManagement,
	};

	deps.plugin.settings.chat = nextChatSettings;
	deps.updateSettings(nextChatSettings);

	try {
		await deps.plugin.saveSettings();
	} catch (error) {
		deps.plugin.settings.chat = previousChatSettings;
		deps.updateSettings(previousChatSettings);
		handleSettingsSaveError(error);
		throw error;
	}
};

export const persistGlobalSystemPromptsEnabled = async (
	deps: Pick<ChatPersistenceDeps, 'plugin'>,
	enabled: boolean
): Promise<void> => {
	const previousAiRuntimeSettings = cloneValue(deps.plugin.settings.aiRuntime);
	deps.plugin.settings.aiRuntime.enableGlobalSystemPrompts = enabled;

	try {
		await deps.plugin.saveSettings();
	} catch (error) {
		deps.plugin.settings.aiRuntime = previousAiRuntimeSettings;
		handleSettingsSaveError(error);
		throw error;
	}
};

export const persistMcpSettings = async (
	deps: ChatPersistenceDeps,
	mcpSettings: McpSettings
): Promise<void> => {
	const previousAiRuntimeSettings = cloneValue(deps.plugin.settings.aiRuntime);
	deps.plugin.settings.aiRuntime.mcp = cloneValue(mcpSettings);
	syncToolExecutionSettings(deps.plugin.settings.aiRuntime);

	try {
		await deps.plugin.saveSettings();
		await deps.runtimeDeps.ensureMcpInitialized();
		await deps.runtimeDeps.ensureSkillsInitialized();
		deps.toolRuntimeResolver.invalidateBuiltinToolsRuntime();
		deps.bindLivePlanStateSync();
		deps.queueSessionPlanSync(deps.state.activeSession);
	} catch (error) {
		deps.plugin.settings.aiRuntime = previousAiRuntimeSettings;
		handleSettingsSaveError(error);
		throw error;
	}
};

export const rewriteSessionMessages = async (
	deps: ChatPersistenceDeps,
	session: ChatSession
): Promise<void> => {
	if (!deps.state.shouldSaveHistory) {
		return;
	}
	syncSessionMultiModelState(deps.state, session);
	if (session.filePath) {
		await deps.sessionManager.rewriteMessagesOnly(session.filePath, session.messages);
		await persistSessionMultiModelFrontmatter(deps, session);
		await deps.persistSessionContextCompactionFrontmatter(session);
		return;
	}
	await deps.saveActiveSession();
};

export const readPersistedLayoutMode = (
	storageKey: string
): LayoutMode | null => {
	try {
		const raw = window.localStorage.getItem(storageKey);
		if (raw === 'horizontal' || raw === 'tabs' || raw === 'vertical') {
			return raw;
		}
	} catch (error) {
		DebugLogger.warn('[ChatService] 读取布局偏好失败', error);
	}
	return null;
};

export const persistLayoutMode = (
	storageKey: string,
	mode: LayoutMode
): void => {
	try {
		window.localStorage.setItem(storageKey, mode);
	} catch (error) {
		DebugLogger.warn('[ChatService] 保存布局偏好失败', error);
	}
};

export const syncSessionMultiModelState = (
	state: ChatState,
	session = state.activeSession
): void => {
	if (!session) {
		return;
	}
	session.multiModelMode = state.multiModelMode;
	session.activeCompareGroupId = state.activeCompareGroupId;
	session.layoutMode = state.layoutMode;
};

export const persistActiveSessionMultiModelFrontmatter = async (
	deps: ChatPersistenceDeps
): Promise<void> => {
	if (!deps.state.activeSession?.filePath) {
		return;
	}
	syncSessionMultiModelState(deps.state, deps.state.activeSession);
	await persistSessionMultiModelFrontmatter(deps, deps.state.activeSession);
};

export const persistSessionMultiModelFrontmatter = async (
	deps: Pick<ChatPersistenceDeps, 'sessionManager' | 'state'>,
	session: ChatSession
): Promise<void> => {
	if (!session.filePath) {
		return;
	}
	await deps.sessionManager.updateSessionFrontmatter(session.filePath, {
		multiModelMode: session.multiModelMode ?? 'single',
		activeCompareGroupId: session.activeCompareGroupId,
		layoutMode: session.layoutMode ?? deps.state.layoutMode,
	});
};

export const restoreMultiModelStateFromSession = (
	deps: Pick<ChatPersistenceDeps, 'state' | 'getDefaultProviderTag' | 'layoutModeStorageKey'>,
	session: ChatSession
): {
	multiModelMode: MultiModelMode;
	activeCompareGroupId?: string;
	selectedModels: string[];
	layoutMode: LayoutMode;
} => {
	const selectedModels = Array.from(
		new Set(
			session.messages.flatMap((message) =>
				message.role === 'assistant' && message.modelTag ? [message.modelTag] : []
			)
		)
	);
	const hasParallelGroup = session.messages.some((message) => Boolean(message.parallelGroupId));
	const inferredMode: MultiModelMode = hasParallelGroup ? 'compare' : 'single';
	const multiModelMode = session.multiModelMode ?? inferredMode;
	const layoutMode =
		session.layoutMode
		?? readPersistedLayoutMode(deps.layoutModeStorageKey)
		?? deps.state.layoutMode;

	return {
		multiModelMode,
		activeCompareGroupId: session.activeCompareGroupId,
		selectedModels: multiModelMode === 'single'
			? [session.modelId || deps.getDefaultProviderTag() || ''].filter(Boolean)
			: selectedModels,
		layoutMode,
	};
};

export type { ChatPersistenceDeps, AiRuntimeSettings };
