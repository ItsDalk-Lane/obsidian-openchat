import { App, TFile, TFolder, normalizePath } from 'obsidian';
import type { QuickAction } from 'src/types/chat';
import { DebugLogger } from 'src/utils/DebugLogger';
import { ensureAIDataFolders, getQuickActionsPath } from 'src/utils/AIPathManager';
import {
	type RawQuickAction,
	type OpenChatPluginLike,
	isNonEmptyString,
	normalizeQuickActions,
	parseMarkdownRecord,
	buildMarkdownRecord,
} from './quickActionDataUtils';
import {
	getNestingLevelSync,
	removeFromAllGroupsSync,
	getSubtreeMaxRelativeDepthSync,
	reorderTopLevelQuickActionsSync,
} from './quickActionGroupHelpers';

/**
 * 快捷操作数据服务
 * 负责管理快捷操作的 Markdown 文件持久化
 */
export class QuickActionDataService {
	private static instance: QuickActionDataService | null = null;
	private quickActionsCache: QuickAction[] | null = null;
	private initializePromise: Promise<void> | null = null;

	private constructor(private readonly app: App) {}

	/**
	 * 获取单例实例
	 */
	static getInstance(app: App): QuickActionDataService {
		if (!QuickActionDataService.instance) {
			QuickActionDataService.instance = new QuickActionDataService(app);
		}
		return QuickActionDataService.instance;
	}

	/**
	 * 重置实例（主要用于测试）
	 */
	static resetInstance(): void {
		QuickActionDataService.instance = null;
	}

	/**
	 * 初始化服务
	 */
	async initialize(): Promise<void> {
		if (this.initializePromise) {
			return this.initializePromise;
		}

		if (this.quickActionsCache !== null) {
			return;
		}

		this.initializePromise = (async () => {
			try {
				await this.loadQuickActions();
				DebugLogger.debug('[QuickActionDataService] 初始化完成，共', this.quickActionsCache?.length || 0, '个操作');
			} catch (error) {
				DebugLogger.error('[QuickActionDataService] 初始化失败', error);
				this.quickActionsCache = [];
			} finally {
				this.initializePromise = null;
			}
		})();

		return this.initializePromise;
	}

	/**
	 * 获取所有快捷操作
	 */
	async getQuickActions(): Promise<QuickAction[]> {
		await this.initialize();
		return this.quickActionsCache || [];
	}

	/**
	 * 获取快捷操作（按排序）
	 */
	async getSortedQuickActions(): Promise<QuickAction[]> {
		const quickActions = await this.getQuickActions();
		return [...quickActions].sort((a, b) => a.order - b.order);
	}

	/**
	 * 根据 ID 获取快捷操作
	 */
	async getQuickActionById(id: string): Promise<QuickAction | undefined> {
		const quickActions = await this.getQuickActions();
		return quickActions.find((quickAction) => quickAction.id === id);
	}

	/**
	 * 获取指定操作组的直接子操作列表
	 */
	async getQuickActionChildren(id: string): Promise<QuickAction[]> {
		const quickActions = await this.getQuickActions();
		const group = quickActions.find((quickAction) => quickAction.id === id);
		if (!group || !group.isActionGroup) {
			return [];
		}

		const childrenIds = group.children ?? [];
		const byId = new Map(quickActions.map((quickAction) => [quickAction.id, quickAction] as const));
		return childrenIds
			.map((childId) => byId.get(childId))
			.filter(Boolean) as QuickAction[];
	}

	/**
	 * 递归获取所有后代快捷操作（按展示顺序平铺）
	 */
	async getAllDescendants(id: string): Promise<QuickAction[]> {
		await this.initialize();
		const quickActions = this.quickActionsCache || [];
		const byId = new Map(quickActions.map((quickAction) => [quickAction.id, quickAction] as const));
		const visited = new Set<string>();
		const result: QuickAction[] = [];

		const walk = (groupId: string): void => {
			const group = byId.get(groupId);
			if (!group || !group.isActionGroup || visited.has(groupId)) {
				return;
			}
			visited.add(groupId);

			for (const childId of (group.children ?? [])) {
				const child = byId.get(childId);
				if (!child) {
					continue;
				}
				result.push(child);
				if (child.isActionGroup) {
					walk(child.id);
				}
			}
		};

		walk(id);
		return result;
	}

	/**
	 * 将快捷操作移动到指定操作组或主列表
	 * @param targetGroupId 目标操作组 ID；为 null 表示主列表
	 * @param position 插入位置（不传则追加到末尾）
	 */
	async moveQuickActionToGroup(quickActionId: string, targetGroupId: string | null, position?: number): Promise<void> {
		await this.initialize();
		const quickActions = this.quickActionsCache || [];
		const byId = new Map(quickActions.map((quickAction) => [quickAction.id, quickAction] as const));
		const quickAction = byId.get(quickActionId);
		if (!quickAction) {
			return;
		}

		const subtreeDepth = getSubtreeMaxRelativeDepthSync(quickActionId, quickActions);

		if (targetGroupId !== null) {
			const targetGroup = byId.get(targetGroupId);
			if (!targetGroup || !targetGroup.isActionGroup) {
				throw new Error('目标不是有效的操作组');
			}

			if (targetGroupId === quickActionId) {
				throw new Error('不能将操作组移动到自身内部');
			}
			const descendants = await this.getAllDescendants(quickActionId);
			if (descendants.some((d) => d.id === targetGroupId)) {
				throw new Error('不能将操作组移动到其后代内部');
			}

			const targetLevel = getNestingLevelSync(targetGroupId, quickActions) + 1;
			if (targetLevel + subtreeDepth > 2) {
				throw new Error('最多支持 3 层嵌套');
			}
		}

		removeFromAllGroupsSync(quickActionId, quickActions);

		if (targetGroupId === null) {
			await reorderTopLevelQuickActionsSync(quickActions, quickActionId, position);
			this.quickActionsCache = quickActions;
			await this.persistQuickActions();
			return;
		}

		const targetGroup = byId.get(targetGroupId);
		if (!targetGroup || !targetGroup.isActionGroup) {
			throw new Error('目标不是有效的操作组');
		}

		const children = [...(targetGroup.children ?? [])].filter((id) => id !== quickActionId);
		const insertAt = position === undefined ? children.length : Math.max(0, Math.min(position, children.length));
		children.splice(insertAt, 0, quickActionId);
		targetGroup.children = children;
		targetGroup.updatedAt = Date.now();

		await reorderTopLevelQuickActionsSync(quickActions);
		this.quickActionsCache = quickActions;
		await this.persistQuickActions();
	}

	/**
	 * 更新操作组的子操作列表
	 */
	async updateQuickActionGroupChildren(groupId: string, childrenIds: string[]): Promise<void> {
		await this.initialize();
		const quickActions = this.quickActionsCache || [];
		const group = quickActions.find((quickAction) => quickAction.id === groupId);
		if (!group || !group.isActionGroup) {
			throw new Error('目标不是有效的操作组');
		}

		const byId = new Map(quickActions.map((quickAction) => [quickAction.id, quickAction] as const));
		const seen = new Set<string>();
		const normalized: string[] = [];
		for (const id of childrenIds) {
			if (!byId.has(id) || id === groupId || seen.has(id)) {
				continue;
			}
			seen.add(id);
			normalized.push(id);
		}

		const groupLevel = getNestingLevelSync(groupId, quickActions);
		for (const childId of normalized) {
			if (childId === groupId) {
				throw new Error('操作组不能包含自身');
			}

			const childDescendants = await this.getAllDescendants(childId);
			if (childDescendants.some((quickAction) => quickAction.id === groupId)) {
				throw new Error('操作组 children 存在循环引用');
			}

			const childSubtreeDepth = getSubtreeMaxRelativeDepthSync(childId, quickActions);
			if (groupLevel + 1 + childSubtreeDepth > 2) {
				throw new Error('最多支持 3 层嵌套');
			}
		}

		group.children = normalized;
		group.updatedAt = Date.now();
		this.quickActionsCache = quickActions;
		await this.persistQuickActions();
	}

	/**
	 * 计算快捷操作嵌套层级（顶层=0）
	 */
	async getNestingLevel(quickActionId: string): Promise<number> {
		await this.initialize();
		return getNestingLevelSync(quickActionId, this.quickActionsCache || []);
	}


	/**
	 * 保存快捷操作（新增或更新）
	 */
	async saveQuickAction(quickAction: QuickAction): Promise<void> {
		const quickActions = await this.getQuickActions();
		const existingIndex = quickActions.findIndex((item) => item.id === quickAction.id);

		if (existingIndex >= 0) {
			quickActions[existingIndex] = quickAction;
			DebugLogger.debug('[QuickActionDataService] 更新操作', quickAction.name);
		} else {
			quickActions.push(quickAction);
			DebugLogger.debug('[QuickActionDataService] 新增操作', quickAction.name);
		}

		this.quickActionsCache = quickActions;
		await this.persistQuickActions();
	}

	/**
	 * 删除快捷操作
	 */
	async deleteQuickAction(id: string): Promise<void> {
		const quickActions = await this.getQuickActions();
		const index = quickActions.findIndex((item) => item.id === id);
		if (index < 0) {
			return;
		}

		removeFromAllGroupsSync(id, quickActions);
		const deletedQuickAction = quickActions.splice(index, 1)[0];
		DebugLogger.debug('[QuickActionDataService] 删除操作', deletedQuickAction.name);
		this.quickActionsCache = quickActions;
		await this.persistQuickActions();
	}

	/**
	 * 更新快捷操作排序
	 */
	async updateQuickActionsOrder(orderedIds: string[]): Promise<void> {
		const quickActions = await this.getQuickActions();
		orderedIds.forEach((id, index) => {
			const quickAction = quickActions.find((item) => item.id === id);
			if (quickAction) {
				quickAction.order = index;
				quickAction.updatedAt = Date.now();
			}
		});

		this.quickActionsCache = quickActions;
		await this.persistQuickActions();
		DebugLogger.debug('[QuickActionDataService] 更新操作排序');
	}

	/**
	 * 更新快捷操作显示状态
	 */
	async updateQuickActionShowInToolbar(id: string, showInToolbar: boolean): Promise<void> {
		const quickActions = await this.getQuickActions();
		const quickAction = quickActions.find((item) => item.id === id);
		if (!quickAction) {
			return;
		}

		quickAction.showInToolbar = showInToolbar;
		quickAction.updatedAt = Date.now();
		this.quickActionsCache = quickActions;
		await this.persistQuickActions();
		DebugLogger.debug('[QuickActionDataService] 更新操作显示状态', quickAction.name, showInToolbar);
	}

	/**
	 * 历史迁移入口已停用（保留签名用于兼容外部调用）
	 */
	async migrateFromSettings(_legacyQuickActions: QuickAction[]): Promise<void> {
		DebugLogger.debug('[QuickActionDataService] migrateFromSettings 已停用，忽略调用');
	}

	/**
	 * 从 quick-actions/*.md 加载快捷操作
	 */
	private async loadQuickActions(): Promise<void> {
		try {
			const folderPath = await this.getStorageFolderPath();
			if (!folderPath) {
				this.quickActionsCache = [];
				return;
			}

			const files = this.listMarkdownFiles(folderPath);
			const loaded: RawQuickAction[] = [];
			for (const [index, file] of files.entries()) {
				try {
					const content = await this.app.vault.read(file);
					const { frontmatter, body } = parseMarkdownRecord(content);
					const item: RawQuickAction = {
						...frontmatter,
						id: isNonEmptyString(frontmatter.id) ? frontmatter.id : file.basename,
						order: typeof frontmatter.order === 'number' ? frontmatter.order : index,
						prompt: body,
					};
					loaded.push(item);
				} catch (error) {
					DebugLogger.warn('[QuickActionDataService] 读取快捷操作文件失败，已跳过', { path: file.path, error });
				}
			}

			this.quickActionsCache = normalizeQuickActions(loaded).sort((a, b) => a.order - b.order);
			this.syncRuntimeSettings(this.quickActionsCache);
			DebugLogger.debug('[QuickActionDataService] 已从 Markdown 加载快捷操作，共', this.quickActionsCache.length, '个操作');
		} catch (error) {
			DebugLogger.error('[QuickActionDataService] 加载操作数据失败', error);
			this.quickActionsCache = [];
		}
	}

	/**
	 * 将缓存全量同步到 quick-actions/*.md，并清理无效旧文件
	 */
	private async persistQuickActions(): Promise<void> {
		const folderPath = await this.getStorageFolderPath();
		if (!folderPath) {
			throw new Error('无法解析 AI 数据目录，无法保存快捷操作');
		}

		const normalizedCache = normalizeQuickActions(this.quickActionsCache || []);
		const expectedPaths = new Set<string>();
		for (const quickAction of normalizedCache) {
			if (!isNonEmptyString(quickAction.id)) {
				DebugLogger.warn('[QuickActionDataService] 快捷操作缺少 id，已跳过写入', quickAction);
				continue;
			}

			const filePath = normalizePath(`${folderPath}/${quickAction.id}.md`);
			expectedPaths.add(filePath);

			// eslint-disable-next-line @typescript-eslint/no-unused-vars -- prompt 被 quickAction.prompt 替代
			const { prompt: _prompt, ...frontmatter } = quickAction as RawQuickAction;
			const body = quickAction.promptSource === 'template' ? '' : (quickAction.prompt ?? '');
			const content = buildMarkdownRecord(frontmatter, body);

			const existing = this.app.vault.getAbstractFileByPath(filePath);
			if (existing instanceof TFile) {
				const previous = await this.app.vault.read(existing);
				if (previous !== content) {
					await this.app.vault.modify(existing, content);
				}
				continue;
			}

			await this.app.vault.create(filePath, content);
		}

		for (const file of this.listMarkdownFiles(folderPath)) {
			if (!expectedPaths.has(file.path)) {
				try {
					await this.app.vault.delete(file, true);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					if (!/ENOENT|does not exist|not found/i.test(message)) {
						throw error;
					}
					DebugLogger.warn('[QuickActionDataService] 删除过期快捷操作文件时文件已不存在，已忽略', {
						path: file.path,
						error: message,
					});
				}
			}
		}

		this.quickActionsCache = normalizedCache;
		this.syncRuntimeSettings(normalizedCache);
		DebugLogger.debug('[QuickActionDataService] 快捷操作已同步到 Markdown 文件');
	}

	private getPluginInstance(): OpenChatPluginLike | null {
		const appWithPlugins = this.app as App & {
			plugins?: { plugins?: Record<string, OpenChatPluginLike | undefined> };
		};
		return appWithPlugins.plugins?.plugins?.openchat ?? null;
	}

	private async getStorageFolderPath(): Promise<string | null> {
		const plugin = this.getPluginInstance();
		let aiDataFolder = plugin?.settings?.aiDataFolder;
		if (plugin?.loadData) {
			try {
				const persisted = await plugin.loadData() as { aiDataFolder?: unknown } | null;
				const persistedAiDataFolder = persisted?.aiDataFolder;
				if (isNonEmptyString(persistedAiDataFolder)) {
					aiDataFolder = persistedAiDataFolder;
				}
			} catch (error) {
				DebugLogger.warn('[QuickActionDataService] 读取 aiDataFolder 失败，回退运行时配置', error);
			}
		}
		if (!isNonEmptyString(aiDataFolder)) {
			DebugLogger.warn('[QuickActionDataService] AI 数据目录未配置，回退为空');
			return null;
		}

		await ensureAIDataFolders(this.app, aiDataFolder);
		return getQuickActionsPath(aiDataFolder);
	}

	private listMarkdownFiles(folderPath: string): TFile[] {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) {
			return [];
		}
		return folder.children.filter((child): child is TFile => child instanceof TFile && child.extension === 'md');
	}


	private syncRuntimeSettings(quickActions: QuickAction[]): void {
		const plugin = this.getPluginInstance();
		if (!plugin?.settings?.chat) {
			return;
		}
		plugin.settings.chat.quickActions = quickActions;
		const chatSettings = plugin.settings.chat as typeof plugin.settings.chat & { skills?: unknown };
		if ('skills' in chatSettings) {
			delete chatSettings.skills;
		}
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		this.quickActionsCache = null;
		this.initializePromise = null;
		QuickActionDataService.instance = null;
	}
}
