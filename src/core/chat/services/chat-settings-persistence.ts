import { localInstance } from 'src/i18n/locals';
import { normalizeMessageManagementSettings } from '../types/chat';
import { syncToolExecutionSettings, type AiRuntimeSettings } from 'src/settings/ai-runtime';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { ChatSettingsAccessor } from './chat-service-types';
import type { McpSettings } from 'src/services/mcp';
import type { ChatRuntimeDeps } from '../runtime/chat-runtime-deps';
import type { ChatSessionManager } from './chat-session-manager';
import type { ChatToolRuntimeResolver } from './chat-tool-runtime-resolver';
import type { ChatSession, ChatSettings, ChatState } from '../types/chat';
import type { LayoutMode, MultiModelMode } from '../types/multiModel';
import type { ObsidianApiProvider } from 'src/providers/providers.types';

interface ChatPersistenceDeps {
	settingsAccessor: ChatSettingsAccessor;
	obsidianApi: Pick<ObsidianApiProvider, 'notify' | 'readLocalStorage' | 'writeLocalStorage'>;
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

export const handleSettingsSaveError = (
	deps: Pick<ChatPersistenceDeps, 'obsidianApi'>,
	error: unknown,
): void => {
	const message = error instanceof Error ? error.message : String(error);
	deps.obsidianApi.notify(`${localInstance.chat_settings_save_failed}: ${message}`);
};

export const persistChatSettings = async (
	deps: ChatPersistenceDeps,
	partial: Partial<ChatSettings>
): Promise<void> => {
	const previousChatSettings = cloneValue(deps.settingsAccessor.getChatSettings());
	const nextMessageManagement = normalizeMessageManagementSettings({
		...(previousChatSettings.messageManagement ?? {}),
		...(partial.messageManagement ?? {}),
	});
	const nextChatSettings = {
		...previousChatSettings,
		...partial,
		messageManagement: nextMessageManagement,
	};

	deps.settingsAccessor.setChatSettings(nextChatSettings);
	deps.updateSettings(nextChatSettings);
	try {
		await deps.settingsAccessor.saveSettings();
	} catch (error) {
		deps.settingsAccessor.setChatSettings(previousChatSettings);
		deps.updateSettings(previousChatSettings);
		handleSettingsSaveError(deps, error);
		throw error;
	}
};

export const persistGlobalSystemPromptsEnabled = async (
	deps: Pick<ChatPersistenceDeps, 'settingsAccessor' | 'obsidianApi'>,
	enabled: boolean
): Promise<void> => {
	const previousAiRuntimeSettings = cloneValue(deps.settingsAccessor.getAiRuntimeSettings());
	deps.settingsAccessor.setAiRuntimeSettings({
		...previousAiRuntimeSettings,
		enableGlobalSystemPrompts: enabled,
	});
	try {
		await deps.settingsAccessor.saveSettings();
	} catch (error) {
		deps.settingsAccessor.setAiRuntimeSettings(previousAiRuntimeSettings);
		handleSettingsSaveError(deps, error);
		throw error;
	}
};

export const persistMcpSettings = async (
	deps: ChatPersistenceDeps,
	mcpSettings: McpSettings
): Promise<void> => {
	const previousAiRuntimeSettings = cloneValue(deps.settingsAccessor.getAiRuntimeSettings());
	const nextAiRuntimeSettings: AiRuntimeSettings = {
		...cloneValue(previousAiRuntimeSettings),
		mcp: cloneValue(mcpSettings),
	};
	syncToolExecutionSettings(nextAiRuntimeSettings);
	deps.settingsAccessor.setAiRuntimeSettings(nextAiRuntimeSettings);

	try {
		await deps.settingsAccessor.saveSettings();
		await deps.runtimeDeps.ensureMcpInitialized();
		await deps.runtimeDeps.ensureSkillsInitialized();
		deps.toolRuntimeResolver.invalidateBuiltinToolsRuntime();
		deps.bindLivePlanStateSync();
		deps.queueSessionPlanSync(deps.state.activeSession);
	} catch (error) {
		deps.settingsAccessor.setAiRuntimeSettings(previousAiRuntimeSettings);
		handleSettingsSaveError(deps, error);
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
	deps: Pick<ChatPersistenceDeps, 'obsidianApi' | 'layoutModeStorageKey'>,
): LayoutMode | null => {
	try {
		const raw = deps.obsidianApi.readLocalStorage(deps.layoutModeStorageKey);
		if (raw === 'horizontal' || raw === 'tabs' || raw === 'vertical') {
			return raw;
		}
	} catch (error) {
		DebugLogger.warn('[ChatService] 读取布局偏好失败', error);
	}
	return null;
};

export const persistLayoutMode = (
	deps: Pick<ChatPersistenceDeps, 'obsidianApi' | 'layoutModeStorageKey'>,
	mode: LayoutMode
): void => {
	try {
		deps.obsidianApi.writeLocalStorage(deps.layoutModeStorageKey, mode);
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
	deps: Pick<ChatPersistenceDeps, 'state' | 'getDefaultProviderTag' | 'layoutModeStorageKey' | 'obsidianApi'>,
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
		?? readPersistedLayoutMode(deps)
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
