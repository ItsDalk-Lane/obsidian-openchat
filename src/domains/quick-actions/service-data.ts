import type { VaultPathPort, VaultReadPort, VaultWritePort, YamlPort } from 'src/providers/providers.types';
import { DebugLogger } from 'src/utils/DebugLogger';
import {
	err,
	ok,
	unwrapQuickActionResult,
} from './service-result';
import type {
	QuickAction,
	QuickActionDataError,
	QuickActionDataRuntimePort,
	QuickActionResult,
	RawQuickAction,
} from './types';
import {
	buildMarkdownRecord,
	isNonEmptyString,
	normalizeQuickActions,
	parseMarkdownRecord,
} from './service-data-utils';
import {
	getNestingLevelSync,
	getSubtreeMaxRelativeDepthSync,
	removeFromAllGroupsSync,
	reorderTopLevelQuickActionsSync,
} from './service-group-helpers';
import {
	createCycleDetectedError,
	createDescendantTargetError,
	createInvalidGroupTargetError,
	createMaxDepthExceededError,
	createSelfTargetError,
	createStorageFolderMissingError,
	getQuickActionIdFromPath,
	getQuickActionsPath,
	isMarkdownEntry,
} from './service-data-support';

export type { QuickActionDataRuntimePort } from './types';

/** QuickActionDataService 所需的最小宿主能力 */
export type QuickActionDataHostPort = VaultPathPort & VaultReadPort & VaultWritePort & YamlPort;

export class QuickActionDataService {
	private quickActionsCache: QuickAction[] | null = null;
	private initializePromise: Promise<void> | null = null;

	constructor(
		private readonly obsidianApi: QuickActionDataHostPort,
		private readonly runtimePort: QuickActionDataRuntimePort,
	) {}

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
				DebugLogger.debug(
					'[QuickActionDataService] 初始化完成，共',
					this.quickActionsCache?.length || 0,
					'个操作',
				);
			} catch (error) {
				DebugLogger.error('[QuickActionDataService] 初始化失败', error);
				this.quickActionsCache = [];
			} finally {
				this.initializePromise = null;
			}
		})();

		return this.initializePromise;
	}

	async getQuickActions(): Promise<QuickAction[]> {
		await this.initialize();
		return this.quickActionsCache || [];
	}

	async getSortedQuickActions(): Promise<QuickAction[]> {
		const quickActions = await this.getQuickActions();
		return [...quickActions].sort((a, b) => a.order - b.order);
	}

	async getQuickActionById(id: string): Promise<QuickAction | undefined> {
		const quickActions = await this.getQuickActions();
		return quickActions.find((quickAction) => quickAction.id === id);
	}

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

			for (const childId of group.children ?? []) {
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

	async moveQuickActionToGroup(
		quickActionId: string,
		targetGroupId: string | null,
		position?: number,
	): Promise<void> {
		unwrapQuickActionResult(
			await this.moveQuickActionToGroupResult(quickActionId, targetGroupId, position),
		);
	}

	async moveQuickActionToGroupResult(
		quickActionId: string,
		targetGroupId: string | null,
		position?: number,
	): Promise<QuickActionResult<void, QuickActionDataError>> {
		await this.initialize();
		const quickActions = this.quickActionsCache || [];
		const byId = new Map(quickActions.map((quickAction) => [quickAction.id, quickAction] as const));
		const quickAction = byId.get(quickActionId);
		if (!quickAction) {
			return ok(undefined);
		}

		const subtreeDepth = getSubtreeMaxRelativeDepthSync(quickActionId, quickActions);
		let targetGroup: QuickAction | null = null;
		if (targetGroupId !== null) {
			const validatedTarget = await this.validateMoveTarget(
				quickActionId,
				targetGroupId,
				subtreeDepth,
				quickActions,
				byId,
			);
			if (!validatedTarget.ok) {
				return validatedTarget;
			}
			targetGroup = validatedTarget.value;
		}

		removeFromAllGroupsSync(quickActionId, quickActions);
		if (targetGroupId === null) {
			await reorderTopLevelQuickActionsSync(quickActions, quickActionId, position);
			this.quickActionsCache = quickActions;
			return await this.persistQuickActionsResult();
		}

		if (!targetGroup || !targetGroup.isActionGroup) {
			return err(createInvalidGroupTargetError(targetGroupId));
		}

		const children = [...(targetGroup.children ?? [])].filter((id) => id !== quickActionId);
		const insertAt = position === undefined
			? children.length
			: Math.max(0, Math.min(position, children.length));
		children.splice(insertAt, 0, quickActionId);
		targetGroup.children = children;
		targetGroup.updatedAt = Date.now();

		await reorderTopLevelQuickActionsSync(quickActions);
		this.quickActionsCache = quickActions;
		return await this.persistQuickActionsResult();
	}

	async updateQuickActionGroupChildren(
		groupId: string,
		childrenIds: string[],
	): Promise<void> {
		unwrapQuickActionResult(
			await this.updateQuickActionGroupChildrenResult(groupId, childrenIds),
		);
	}

	async updateQuickActionGroupChildrenResult(
		groupId: string,
		childrenIds: string[],
	): Promise<QuickActionResult<void, QuickActionDataError>> {
		await this.initialize();
		const quickActions = this.quickActionsCache || [];
		const group = quickActions.find((quickAction) => quickAction.id === groupId);
		if (!group || !group.isActionGroup) {
			return err(createInvalidGroupTargetError(groupId));
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
			const childDescendants = await this.getAllDescendants(childId);
			if (childDescendants.some((quickAction) => quickAction.id === groupId)) {
				return err(createCycleDetectedError(groupId, childId));
			}
			const childSubtreeDepth = getSubtreeMaxRelativeDepthSync(childId, quickActions);
			if (groupLevel + 1 + childSubtreeDepth > 2) {
				return err(createMaxDepthExceededError(childId, groupId));
			}
		}

		group.children = normalized;
		group.updatedAt = Date.now();
		this.quickActionsCache = quickActions;
		return await this.persistQuickActionsResult();
	}

	async getNestingLevel(quickActionId: string): Promise<number> {
		await this.initialize();
		return getNestingLevelSync(quickActionId, this.quickActionsCache || []);
	}

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
		await this.persistQuickActionsOrThrow();
	}

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
		await this.persistQuickActionsOrThrow();
	}

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
		await this.persistQuickActionsOrThrow();
		DebugLogger.debug('[QuickActionDataService] 更新操作排序');
	}

	async updateQuickActionShowInToolbar(id: string, showInToolbar: boolean): Promise<void> {
		const quickActions = await this.getQuickActions();
		const quickAction = quickActions.find((item) => item.id === id);
		if (!quickAction) {
			return;
		}

		quickAction.showInToolbar = showInToolbar;
		quickAction.updatedAt = Date.now();
		this.quickActionsCache = quickActions;
		await this.persistQuickActionsOrThrow();
		DebugLogger.debug(
			'[QuickActionDataService] 更新操作显示状态',
			quickAction.name,
			showInToolbar,
		);
	}

	async migrateFromSettings(_legacyQuickActions: QuickAction[]): Promise<void> {
		DebugLogger.debug('[QuickActionDataService] migrateFromSettings 已停用，忽略调用');
	}

	dispose(): void {
		this.quickActionsCache = null;
		this.initializePromise = null;
	}

	private async loadQuickActions(): Promise<void> {
		try {
			const folderPathResult = await this.getStorageFolderPathResult();
			if (!folderPathResult.ok) {
				this.quickActionsCache = [];
				return;
			}
			const folderPath = folderPathResult.value;

			const files = this.listMarkdownFiles(folderPath);
			const loaded: RawQuickAction[] = [];
			for (const [index, filePath] of files.entries()) {
				try {
					const content = await this.obsidianApi.readVaultFile(filePath);
					const { frontmatter, body } = parseMarkdownRecord(
						content,
						(value) => this.obsidianApi.parseYaml(value),
					);
					loaded.push({
						...frontmatter,
						id: isNonEmptyString(frontmatter.id)
							? frontmatter.id
							: getQuickActionIdFromPath(filePath),
						order: typeof frontmatter.order === 'number' ? frontmatter.order : index,
						prompt: body,
					});
				} catch (error) {
					DebugLogger.warn(
						'[QuickActionDataService] 读取快捷操作文件失败，已跳过',
						{ path: filePath, error },
					);
				}
			}

			this.quickActionsCache = normalizeQuickActions(loaded).sort((a, b) => a.order - b.order);
			this.runtimePort.syncRuntimeQuickActions(this.quickActionsCache);
			DebugLogger.debug(
				'[QuickActionDataService] 已从 Markdown 加载快捷操作，共',
				this.quickActionsCache.length,
				'个操作',
			);
		} catch (error) {
			DebugLogger.error('[QuickActionDataService] 加载操作数据失败', error);
			this.quickActionsCache = [];
		}
	}

	private async persistQuickActionsResult(): Promise<
		QuickActionResult<void, QuickActionDataError>
	> {
		const folderPathResult = await this.getStorageFolderPathResult();
		if (!folderPathResult.ok) {
			return folderPathResult;
		}
		const folderPath = folderPathResult.value;

		const normalizedCache = normalizeQuickActions(this.quickActionsCache || []);
		const expectedPaths = new Set<string>();

		for (const quickAction of normalizedCache) {
			if (!isNonEmptyString(quickAction.id)) {
				DebugLogger.warn('[QuickActionDataService] 快捷操作缺少 id，已跳过写入', quickAction);
				continue;
			}

			const filePath = this.obsidianApi.normalizePath(`${folderPath}/${quickAction.id}.md`);
			expectedPaths.add(filePath);
			const frontmatter = { ...(quickAction as RawQuickAction) };
			delete frontmatter.prompt;
			const body = quickAction.promptSource === 'template' ? '' : (quickAction.prompt ?? '');
			const content = buildMarkdownRecord(
				frontmatter,
				body,
				(value) => this.obsidianApi.stringifyYaml(value),
			);
			const existing = this.obsidianApi.getVaultEntry(filePath);
			if (existing?.kind === 'file') {
				const previous = await this.obsidianApi.readVaultFile(filePath);
				if (previous !== content) {
					await this.obsidianApi.writeVaultFile(filePath, content);
				}
				continue;
			}
			await this.obsidianApi.writeVaultFile(filePath, content);
		}

		for (const filePath of this.listMarkdownFiles(folderPath)) {
			if (!expectedPaths.has(filePath)) {
				try {
					await this.obsidianApi.deleteVaultPath(filePath);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					if (!/ENOENT|does not exist|not found/i.test(message)) {
						throw error;
					}
					DebugLogger.warn(
						'[QuickActionDataService] 删除过期快捷操作文件时文件已不存在，已忽略',
						{ path: filePath, error: message },
					);
				}
			}
		}

		this.quickActionsCache = normalizedCache;
		this.runtimePort.syncRuntimeQuickActions(normalizedCache);
		DebugLogger.debug('[QuickActionDataService] 快捷操作已同步到 Markdown 文件');
		return ok(undefined);
	}

	private async persistQuickActionsOrThrow(): Promise<void> {
		unwrapQuickActionResult(await this.persistQuickActionsResult());
	}

	private async getStorageFolderPathResult(): Promise<
		QuickActionResult<string, QuickActionDataError>
	> {
		const aiDataFolder = this.runtimePort.getAiDataFolder().trim();
		if (!aiDataFolder) {
			DebugLogger.warn('[QuickActionDataService] AI 数据目录未配置，回退为空');
			return err(createStorageFolderMissingError(aiDataFolder));
		}

		await this.obsidianApi.ensureAiDataFolders(aiDataFolder);
		return ok(getQuickActionsPath(this.obsidianApi, aiDataFolder));
	}

	private async validateMoveTarget(
		quickActionId: string,
		targetGroupId: string,
		subtreeDepth: number,
		quickActions: QuickAction[],
		byId: Map<string, QuickAction>,
	): Promise<QuickActionResult<QuickAction, QuickActionDataError>> {
		const targetGroup = byId.get(targetGroupId);
		if (!targetGroup || !targetGroup.isActionGroup) {
			return err(createInvalidGroupTargetError(targetGroupId));
		}
		if (targetGroupId === quickActionId) {
			return err(createSelfTargetError(quickActionId));
		}

		const descendants = await this.getAllDescendants(quickActionId);
		if (descendants.some((item) => item.id === targetGroupId)) {
			return err(createDescendantTargetError(quickActionId, targetGroupId));
		}

		const targetLevel = getNestingLevelSync(targetGroupId, quickActions) + 1;
		if (targetLevel + subtreeDepth > 2) {
			return err(createMaxDepthExceededError(quickActionId, targetGroupId));
		}

		return ok(targetGroup);
	}

	private listMarkdownFiles(folderPath: string): string[] {
		return this.obsidianApi
			.listFolderEntries(folderPath)
			.filter(isMarkdownEntry)
			.map((entry) => entry.path)
			.sort((left, right) => left.localeCompare(right));
	}
}
