/**
 * @module settings/service
 * @description 承载 settings 域的加载、保存、迁移与目录初始化逻辑。
 *
 * @dependencies src/domains/settings/types, src/domains/settings/config, src/providers/providers.types, legacy settings services
 * @side-effects 读写 data.json、迁移旧数据、初始化 AI 数据目录
 * @invariants 不直接导入 obsidian；Obsidian 能力通过 provider 或结构化适配器传入。
 */

import type { McpSettings } from 'src/types/mcp';
import { DEFAULT_MCP_SETTINGS } from 'src/types/mcp';
import { SettingsSecretManager } from 'src/settings/SettingsSecretManager';
import { cloneAiRuntimeSettings } from 'src/settings/ai-runtime/core';
import type { AiRuntimeSettings } from 'src/settings/ai-runtime/core';
import { DEFAULT_CHAT_SETTINGS, type ChatSettings } from 'src/types/chat';
import type { ObsidianApiProvider } from 'src/providers/providers.types';
import { DEFAULT_SETTINGS } from './config';
import type { PluginSettings, SettingsDomainLogger, SettingsPluginAdapter } from './types';
interface LegacySystemPromptService {
	migrateFromLegacyDefaultSystemMessage(params: {
		enabled?: boolean;
		content?: string | null;
	}): Promise<boolean>;
}
interface LegacyMcpServerDataService {
	loadServers(aiDataFolder: string): Promise<unknown[]>;
	syncServers(aiDataFolder: string, servers: unknown[]): Promise<unknown[]>;
}
interface SettingsDomainDependencies {
	createSecretManager(): SettingsSecretAdapter;
	getMigrationService(pluginAdapter: SettingsPluginAdapter): Promise<SettingsMigrationAdapter>;
	getSystemPromptService(app: unknown): Promise<LegacySystemPromptService>;
	getMcpServerService(app: unknown): Promise<LegacyMcpServerDataService>;
}
interface SettingsSecretAdapter {
	decryptAiRuntimeSettings(
		settings?: Partial<AiRuntimeSettings> | Record<string, unknown>,
	): AiRuntimeSettings;
	encryptAiRuntimeSettings(settings: AiRuntimeSettings): AiRuntimeSettings;
}
interface SettingsMigrationAdapter {
	resolvePersistedAiRuntime(persisted: Record<string, unknown>): Record<string, unknown>;
	resolveAiDataFolder(
		persisted: Record<string, unknown>,
		rawChatSettings: Record<string, unknown>,
	): string;
	normalizeLegacyFolderPath(value: unknown): string | undefined;
	migrateAIDataStorage(settings: PluginSettings): Promise<void>;
	cleanupLegacyAIStorage(): Promise<void>;
}

const CHAT_RUNTIME_ONLY_FIELDS = ['quickActions', 'skills'] as const;
const CHAT_LEGACY_FIELDS = ['chatFolder', 'enableInternalLinkParsing', 'parseLinksInTemplates', 'maxLinkParseDepth', 'linkParseTimeout', 'enableSelectionToolbar', 'maxToolbarButtons', 'selectionToolbarStreamOutput'] as const;
const AI_RUNTIME_LEGACY_FIELDS = ['enableDefaultSystemMsg', 'defaultSystemMsg', 'systemPromptsData', 'enableInternalLink', 'maxLinkParseDepth', 'linkParseTimeout'] as const;
const AI_RUNTIME_RUNTIME_ONLY_FIELDS = ['editorStatus', 'vendorApiKeys'] as const;
const LEGACY_TOP_LEVEL_FIELDS = ['promptTemplateFolder', 'tars'] as const;
const defaultSettingsDomainDependencies: SettingsDomainDependencies = {
	createSecretManager(): SettingsSecretAdapter {
		return new SettingsSecretManager();
	},
	async getMigrationService(
		pluginAdapter: SettingsPluginAdapter,
	): Promise<SettingsMigrationAdapter> {
		const { SettingsMigrationService } = await import(
			'src/settings/SettingsMigrationService'
		);
		type MigrationPlugin = ConstructorParameters<typeof SettingsMigrationService>[0];
		return new SettingsMigrationService(pluginAdapter as MigrationPlugin);
	},
	async getSystemPromptService(app: unknown): Promise<LegacySystemPromptService> {
		const { SystemPromptDataService } = await import(
			'src/settings/system-prompts/SystemPromptDataService'
		);
		type SystemPromptApp = Parameters<typeof SystemPromptDataService.getInstance>[0];
		return SystemPromptDataService.getInstance(app as SystemPromptApp);
	},
	async getMcpServerService(app: unknown): Promise<LegacyMcpServerDataService> {
		const { McpServerDataService } = await import(
			'src/services/mcp/McpServerDataService'
		);
		type McpApp = Parameters<typeof McpServerDataService.getInstance>[0];
		return McpServerDataService.getInstance(app as McpApp);
	},
};

/**
 * @precondition pluginAdapter、obsidianApi 与 logger 由组合根注入
 * @postcondition 提供 settings 域的加载、保存、迁移与目录初始化入口
 * @throws 仅在底层持久化或迁移依赖失败且未被内部降级时抛出
 */
export class SettingsDomainService {
	private readonly secretManager: SettingsSecretAdapter;
	private migrationServicePromise: Promise<SettingsMigrationAdapter> | null = null;
	constructor(
		private readonly pluginAdapter: SettingsPluginAdapter,
		private readonly obsidianApi: ObsidianApiProvider,
		private readonly logger: SettingsDomainLogger,
		private readonly dependencies: SettingsDomainDependencies = defaultSettingsDomainDependencies,
	) {
		this.secretManager = this.dependencies.createSecretManager();
	}

	/** @precondition pluginAdapter.loadData 可返回持久化设置或 null @postcondition 返回可用于启动注册的基础设置快照，不触发迁移或 Markdown hydrate @throws 当关键迁移依赖失败时抛出 @example await service.loadBootstrapSettings() */
	async loadBootstrapSettings(): Promise<PluginSettings> {
		const migrationService = await this.getMigrationService();
		const persisted = (await this.pluginAdapter.loadData()) ?? {};
		const rawChatSettings = asRecord(persisted.chat);
		const mergedChat = buildLoadedChatSettings(rawChatSettings);
		const persistedAiRuntime = migrationService.resolvePersistedAiRuntime(persisted);
		const aiRuntimeSettings = cloneAiRuntimeSettings(
			this.secretManager.decryptAiRuntimeSettings(persistedAiRuntime),
		);
		const aiDataFolder = migrationService.resolveAiDataFolder(persisted, rawChatSettings);
		deleteFields(
			aiRuntimeSettings as unknown as Record<string, unknown>,
			['enableDefaultSystemMsg', 'defaultSystemMsg', 'systemPromptsData'],
		);

		return {
			...DEFAULT_SETTINGS,
			...omitLegacyTopLevelFields(persisted),
			aiDataFolder,
			aiRuntime: aiRuntimeSettings,
			chat: stripLegacyChatFields(mergedChat),
		};
	}

	/** @precondition settings 来自 bootstrap 阶段且包含完整基础配置 @postcondition 返回补齐系统提示词迁移与 MCP Markdown 配置后的设置快照 @throws 当关键 hydrate 依赖失败且未被内部降级时抛出 @example await service.hydratePersistedSettings(settings) */
	async hydratePersistedSettings(settings: PluginSettings): Promise<PluginSettings> {
		const hydratedAiRuntime = cloneAiRuntimeSettings(settings.aiRuntime);
		try {
			const systemPromptService = await this.dependencies.getSystemPromptService(
				this.pluginAdapter.app,
			);
			const migrated = await systemPromptService.migrateFromLegacyDefaultSystemMessage({
				enabled: getBooleanField(hydratedAiRuntime, 'enableDefaultSystemMsg'),
				content: getStringOrNullField(hydratedAiRuntime, 'defaultSystemMsg'),
			});
			if (migrated) {
				hydratedAiRuntime.enableGlobalSystemPrompts = true;
			}
		} catch (error) {
			this.logger.error('[SettingsDomain] 迁移默认系统消息失败（忽略，继续加载）', error);
		}

		try {
			const mcpServerService = await this.dependencies.getMcpServerService(
				this.pluginAdapter.app,
			);
			const markdownServers = await mcpServerService.loadServers(settings.aiDataFolder);
			hydratedAiRuntime.mcp = {
				...DEFAULT_MCP_SETTINGS,
				...(hydratedAiRuntime.mcp ?? {}),
				servers: markdownServers,
			};
		} catch (error) {
			this.logger.error('[SettingsDomain] 加载 MCP 服务器 Markdown 配置失败，回退空列表', error);
			hydratedAiRuntime.mcp = {
				...DEFAULT_MCP_SETTINGS,
				...(hydratedAiRuntime.mcp ?? {}),
				servers: [],
			};
		}

		deleteFields(
			hydratedAiRuntime as unknown as Record<string, unknown>,
			['enableDefaultSystemMsg', 'defaultSystemMsg', 'systemPromptsData'],
		);
		return {
			...settings,
			aiRuntime: hydratedAiRuntime,
		};
	}
	/** @precondition settings 为待持久化的完整设置快照 @postcondition data.json 被更新且运行时字段不会被写回 @throws 当持久化本身失败时抛出 @example await service.save(settings) */
	async save(settings: PluginSettings): Promise<void> {
		const migrationService = await this.getMigrationService();
		const encryptedAiRuntime = this.secretManager.encryptAiRuntimeSettings(settings.aiRuntime);
		deleteFields(encryptedAiRuntime as unknown as Record<string, unknown>, ['enableDefaultSystemMsg', 'defaultSystemMsg']);
		const persisted = (await this.pluginAdapter.loadData()) ?? {};
		const persistedChat = asRecord(persisted.chat);
		const persistedAiRuntime = migrationService.resolvePersistedAiRuntime(persisted);
		const mergedChat = { ...persistedChat, ...settings.chat };
		deleteFields(mergedChat, [...CHAT_RUNTIME_ONLY_FIELDS, ...CHAT_LEGACY_FIELDS]);
		const mergedAiRuntime = { ...persistedAiRuntime, ...encryptedAiRuntime };
		deleteFields(mergedAiRuntime, [...AI_RUNTIME_LEGACY_FIELDS, ...AI_RUNTIME_RUNTIME_ONLY_FIELDS]);
		const normalizedAiDataFolder =
			migrationService.normalizeLegacyFolderPath(settings.aiDataFolder)
			|| DEFAULT_SETTINGS.aiDataFolder;
		const runtimeMcpSettings: McpSettings = { ...DEFAULT_MCP_SETTINGS, ...(settings.aiRuntime.mcp ?? {}) };
		stripRemovedBuiltinMcpFields(runtimeMcpSettings as unknown as Record<string, unknown>);
		let normalizedMcpServers = runtimeMcpSettings.servers ?? [];
		try {
			const mcpServerService = await this.dependencies.getMcpServerService(
				this.pluginAdapter.app,
			);
			normalizedMcpServers = await mcpServerService.syncServers(
				normalizedAiDataFolder,
				runtimeMcpSettings.servers ?? [],
			);
		} catch (error) {
			this.logger.error(
				'[SettingsDomain] 保存 MCP 服务器 Markdown 配置失败，继续保存其余设置',
				error,
			);
		}
		settings.aiRuntime.mcp = { ...runtimeMcpSettings, servers: normalizedMcpServers };
		const mergedMcpSettings = { ...DEFAULT_MCP_SETTINGS, ...(asRecord(mergedAiRuntime).mcp ?? {}) } as Record<string, unknown>;
		delete mergedMcpSettings.servers;
		stripRemovedBuiltinMcpFields(mergedMcpSettings);
		(mergedAiRuntime as Record<string, unknown>).mcp = mergedMcpSettings;
		const settingsToPersist = {
			...persisted,
			...settings,
			aiDataFolder: normalizedAiDataFolder,
			chat: mergedChat,
			aiRuntime: mergedAiRuntime,
		};
		deleteFields(settingsToPersist, LEGACY_TOP_LEVEL_FIELDS);
		await this.pluginAdapter.saveData(settingsToPersist);
	}

	/** @precondition aiDataFolder 为目标 AI 数据目录 @postcondition 通过 provider 确保目录结构存在 @throws 当 provider 创建目录失败时抛出 @example await service.ensureAiDataFolders('System/AI Data') */
	async ensureAiDataFolders(aiDataFolder: string): Promise<void> {
		await this.obsidianApi.ensureAiDataFolders(aiDataFolder);
	}

	/** @precondition settings 为迁移目标设置 @postcondition 旧 AI 数据目录被迁移到新位置 @throws 当迁移依赖失败时抛出 @example await service.migrateAiDataStorage(settings) */
	async migrateAiDataStorage(settings: PluginSettings): Promise<void> {
		const migrationService = await this.getMigrationService();
		await migrationService.migrateAIDataStorage(settings);
	}

	/** @precondition 无 @postcondition 旧版 AI 存储残留被清理 @throws 当清理依赖失败时抛出 @example await service.cleanupLegacyAiStorage() */
	async cleanupLegacyAiStorage(): Promise<void> {
		const migrationService = await this.getMigrationService();
		await migrationService.cleanupLegacyAIStorage();
	}

	private getMigrationService(): Promise<SettingsMigrationAdapter> {
		if (!this.migrationServicePromise) {
			this.migrationServicePromise = this.dependencies.getMigrationService(
				this.pluginAdapter,
			).catch((error) => {
				this.migrationServicePromise = null;
				throw error;
			});
		}
		return this.migrationServicePromise;
	}
}
function buildLoadedChatSettings(rawChatSettings: Record<string, unknown>): ChatSettings {
	const legacyQuickActionSettings = rawChatSettings as { enableSelectionToolbar?: boolean; maxToolbarButtons?: number; selectionToolbarStreamOutput?: boolean };
	return {
		...DEFAULT_CHAT_SETTINGS,
		...rawChatSettings,
		enableQuickActions: (rawChatSettings.enableQuickActions as boolean | undefined) ?? legacyQuickActionSettings.enableSelectionToolbar ?? DEFAULT_CHAT_SETTINGS.enableQuickActions,
		maxQuickActionButtons: (rawChatSettings.maxQuickActionButtons as number | undefined) ?? legacyQuickActionSettings.maxToolbarButtons ?? DEFAULT_CHAT_SETTINGS.maxQuickActionButtons,
		quickActionsStreamOutput: (rawChatSettings.quickActionsStreamOutput as boolean | undefined) ?? legacyQuickActionSettings.selectionToolbarStreamOutput ?? DEFAULT_CHAT_SETTINGS.quickActionsStreamOutput,
	};
}

function stripLegacyChatFields(chatSettings: ChatSettings): ChatSettings {
	const chatWithoutLegacy = { ...chatSettings } as ChatSettings & Record<string, unknown>;
	deleteFields(chatWithoutLegacy, [...CHAT_RUNTIME_ONLY_FIELDS, ...CHAT_LEGACY_FIELDS]);
	return { ...chatWithoutLegacy, quickActions: [] };
}

function omitLegacyTopLevelFields(persisted: Record<string, unknown>): Record<string, unknown> {
	const nextValue = { ...persisted };
	deleteFields(nextValue, LEGACY_TOP_LEVEL_FIELDS);
	return nextValue;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {};
}

function deleteFields(value: Record<string, unknown>, fields: readonly string[]): void {
	for (const field of fields) {
		delete value[field];
	}
}

function getBooleanField(value: unknown, field: string): boolean | undefined {
	const fieldValue = asRecord(value)[field];
	return typeof fieldValue === 'boolean' ? fieldValue : undefined;
}

function getStringOrNullField(value: unknown, field: string): string | null | undefined {
	const fieldValue = asRecord(value)[field];
	return typeof fieldValue === 'string' || fieldValue === null ? fieldValue : undefined;
}

function stripRemovedBuiltinMcpFields(value: Record<string, unknown>): void {
	deleteFields(value, ['builtinVaultEnabled', 'builtinObsidianSearchEnabled', 'builtinMemoryEnabled', 'builtinSequentialThinkingEnabled', 'builtinMemoryFilePath', 'builtinSequentialThinkingDisableThoughtLogging']);
}
