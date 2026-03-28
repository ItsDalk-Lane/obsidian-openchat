/**
 * ChatSessionManager - 聊天会话管理服务
 * 负责会话生命周期管理、历史加载/保存、多模型状态同步
 * 从 ChatService 中拆分出来，遵循单一职责原则
 */
import { t } from 'src/i18n/ai-runtime/helper';
import type { ObsidianApiProvider } from 'src/providers/providers.types';
import { HistoryService, ChatHistoryEntry } from './history-service';
import type { ChatSession, ChatState } from '../types/chat';
import type { MultiModelMode, LayoutMode } from '../types/multiModel';
import { getChatHistoryPath } from 'src/utils/AIPathManager';
import { DebugLogger } from '../../../utils/DebugLogger';
import type { MessageService } from './message-service';

export interface SessionManagerDeps {
	getState: () => ChatState;
	getSettings: () => { defaultModel?: string; autosaveChat?: boolean };
	getDefaultProviderTag: () => string | null;
	applySessionSelection: (session: ChatSession) => void;
	emitState: () => void;
	queueSessionPlanSync: (session: ChatSession | null) => void;
}

type SessionHost = Pick<
	ObsidianApiProvider,
	| 'deleteVaultPath'
	| 'ensureVaultFolder'
	| 'getFrontmatter'
	| 'getVaultEntry'
	| 'listFolderEntries'
	| 'notify'
	| 'parseYaml'
	| 'pathExists'
	| 'readLocalStorage'
	| 'readVaultFile'
	| 'statPath'
	| 'stringifyYaml'
	| 'writeLocalStorage'
	| 'writeVaultFile'
>;

export class ChatSessionManager {
	private readonly historyService: HistoryService;

	constructor(
		private readonly obsidianApi: SessionHost,
		private readonly aiDataFolder: string,
		private readonly messageService: MessageService,
		private readonly deps: SessionManagerDeps
	) {
		this.historyService = new HistoryService(
			obsidianApi,
			messageService,
			getChatHistoryPath(aiDataFolder)
		);
	}

	/**
	 * 设置历史文件夹路径
	 */
	setHistoryFolder(folder: string): void {
		this.historyService.setFolder(folder);
	}

	/**
	 * 列出所有历史会话
	 */
	async listHistory(): Promise<ChatHistoryEntry[]> {
		return this.historyService.listSessions();
	}

	/**
	 * 加载历史会话
	 */
	async loadHistory(filePath: string): Promise<ChatSession | null> {
		const session = await this.historyService.loadSession(filePath);
		if (session) {
			session.enableTemplateAsSystemPrompt = session.enableTemplateAsSystemPrompt ?? false;
			session.filePath = filePath;
		}
		return session;
	}

	/**
	 * 保存活动会话
	 */
	async saveSession(session: ChatSession): Promise<void> {
		if (!session) return;
		await this.historyService.saveSession(session);
		this.obsidianApi.notify(t('Chat session saved'));
	}

	/**
	 * 删除历史会话
	 */
	async deleteHistory(filePath: string): Promise<void> {
		await this.historyService.deleteSession(filePath);
	}

	/**
	 * 创建新会话文件并写入首条消息
	 */
	async createNewSessionFileWithFirstMessage(
		session: ChatSession,
		firstMessage: ChatSession['messages'][number],
		selectedFiles: ChatSession['selectedFiles'],
		selectedFolders: ChatSession['selectedFolders']
	): Promise<string> {
		return this.historyService.createNewSessionFileWithFirstMessage(
			session,
			firstMessage,
			selectedFiles,
			selectedFolders
		);
	}

	/**
	 * 追加消息到会话文件
	 */
	async appendMessageToFile(
		filePath: string,
		message: ChatSession['messages'][number],
		selectedFiles?: ChatSession['selectedFiles'],
		selectedFolders?: ChatSession['selectedFolders']
	): Promise<void> {
		await this.historyService.appendMessageToFile(filePath, message, selectedFiles, selectedFolders);
	}

	/**
	 * 重写会话消息
	 */
	async rewriteMessagesOnly(
		filePath: string,
		messages: ChatSession['messages'],
		livePlan?: ChatSession['livePlan'] | null
	): Promise<void> {
		await this.historyService.rewriteMessagesOnly(filePath, messages, livePlan);
	}

	/**
	 * 更新会话 frontmatter
	 */
	async updateSessionFrontmatter(
		filePath: string,
		frontmatter: Record<string, unknown>
	): Promise<void> {
		await this.historyService.updateSessionFrontmatter(filePath, frontmatter);
	}

	/**
	 * 从会话中恢复多模型状态
	 */
	restoreMultiModelStateFromSession(session: ChatSession): {
		multiModelMode: MultiModelMode;
		activeCompareGroupId?: string;
		selectedModels: string[];
		layoutMode: LayoutMode;
	} {
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
		const state = this.deps.getState();
		const layoutMode = session.layoutMode ?? this.readPersistedLayoutMode() ?? state.layoutMode;

		return {
			multiModelMode,
			activeCompareGroupId: session.activeCompareGroupId,
			selectedModels: multiModelMode === 'single'
				? [session.modelId || this.deps.getDefaultProviderTag() || ''].filter(Boolean)
				: selectedModels,
			layoutMode
		};
	}

	/**
	 * 同步会话多模型状态
	 */
	syncSessionMultiModelState(
		session: ChatSession | null,
		state: ChatState
	): void {
		if (!session) return;
		session.multiModelMode = state.multiModelMode;
		session.activeCompareGroupId = state.activeCompareGroupId;
		session.layoutMode = state.layoutMode;
	}

	/**
	 * 持久化会话多模型状态到 frontmatter
	 */
	async persistSessionMultiModelFrontmatter(
		session: ChatSession,
		state: ChatState
	): Promise<void> {
		if (!session.filePath) return;
		this.syncSessionMultiModelState(session, state);
		await this.updateSessionFrontmatter(session.filePath, {
			multiModelMode: session.multiModelMode ?? 'single',
			activeCompareGroupId: session.activeCompareGroupId,
			layoutMode: session.layoutMode ?? state.layoutMode
		});
	}

	/**
	 * 持久化会话上下文压缩状态到 frontmatter
	 */
	async persistSessionContextCompactionFrontmatter(session: ChatSession): Promise<void> {
		if (!session.filePath) return;
		const frontmatter: Record<string, unknown> = {};
		if (session.contextCompaction) {
			frontmatter.contextCompaction = session.contextCompaction;
		}
		if (session.requestTokenState) {
			frontmatter.requestTokenState = session.requestTokenState;
		}
		await this.updateSessionFrontmatter(session.filePath, frontmatter);
	}

	/**
	 * 读取持久化的布局模式
	 */
	private readPersistedLayoutMode(): LayoutMode | null {
		try {
			const raw = this.obsidianApi.readLocalStorage('openchat-layout-mode');
			if (raw === 'horizontal' || raw === 'tabs' || raw === 'vertical') {
				return raw;
			}
		} catch (error) {
			DebugLogger.warn('[ChatSessionManager] 读取布局偏好失败:', error);
		}
		return null;
	}

	/**
	 * 持久化布局模式
	 */
	persistLayoutMode(mode: LayoutMode): void {
		try {
			this.obsidianApi.writeLocalStorage('openchat-layout-mode', mode);
		} catch (error) {
			DebugLogger.warn('[ChatSessionManager] 保存布局偏好失败:', error);
		}
	}

	/**
	 * 清理资源
	 */
	dispose(): void {
		// HistoryService 没有需要清理的资源
	}
}
