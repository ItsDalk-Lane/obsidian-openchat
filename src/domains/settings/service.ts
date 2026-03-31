/**
 * @module settings/service
 * @description 承载 settings 域的加载、保存、迁移与目录初始化逻辑。
 *
 * @dependencies src/domains/settings/types, src/domains/settings/config
 * @side-effects 读写 data.json、迁移旧数据、初始化 AI 数据目录
 * @invariants 不直接导入 obsidian 或 legacy 具体实现；所有外部能力通过显式端口注入。
 *             不持有 app、plugin 或宿主对象引用。
 */

import type { McpSettings } from 'src/types/mcp';
import { DEFAULT_MCP_SETTINGS } from 'src/types/mcp';
import { DEFAULT_CHAT_SETTINGS, type ChatSettings } from 'src/types/chat';
import { cloneAiRuntimeSettings } from './config-ai-runtime';
import { DEFAULT_SETTINGS } from './config';
import type {
	PluginSettings,
	SettingsDomainLogger,
	SettingsHostPort,
	SettingsMcpServerPort,
	SettingsMigrationPort,
	SettingsPersistencePort,
	SettingsSecretPort,
} from './types';

/** SettingsDomainService 所需的全部端口，由组合根一次性注入 */
export interface SettingsDomainPorts {
	readonly persistence: SettingsPersistencePort;
	readonly host: SettingsHostPort;
	readonly secret: SettingsSecretPort;
	readonly migration: SettingsMigrationPort;
	readonly mcpServer: SettingsMcpServerPort;
	readonly logger: SettingsDomainLogger;
}

const CHAT_RUNTIME_ONLY_FIELDS = ['quickActions', 'skills'] as const;
const CHAT_LEGACY_FIELDS = ['chatFolder', 'enableInternalLinkParsing', 'parseLinksInTemplates', 'maxLinkParseDepth', 'linkParseTimeout', 'enableSelectionToolbar', 'maxToolbarButtons', 'selectionToolbarStreamOutput', 'showRibbonIcon', 'autoAddActiveFile'] as const;
const AI_RUNTIME_LEGACY_FIELDS = ['enableDefaultSystemMsg', 'defaultSystemMsg', 'enableGlobalSystemPrompts', 'systemPromptsData', 'enableInternalLink', 'maxLinkParseDepth', 'linkParseTimeout'] as const;
const AI_RUNTIME_RUNTIME_ONLY_FIELDS = ['editorStatus', 'vendorApiKeys'] as const;
const LEGACY_TOP_LEVEL_FIELDS = ['promptTemplateFolder', 'tars'] as const;

/**
 * @precondition 所有端口由组合根注入，不持有宿主对象引用
 * @postcondition 提供 settings 域的加载、保存、迁移与目录初始化入口
 * @throws 仅在底层持久化或迁移依赖失败且未被内部降级时抛出
 */
export class SettingsDomainService {
	private readonly persistence: SettingsPersistencePort;
	private readonly host: SettingsHostPort;
	private readonly secret: SettingsSecretPort;
	private readonly migration: SettingsMigrationPort;
	private readonly mcpServer: SettingsMcpServerPort;
	private readonly logger: SettingsDomainLogger;

	constructor(ports: SettingsDomainPorts) {
		this.persistence = ports.persistence;
		this.host = ports.host;
		this.secret = ports.secret;
		this.migration = ports.migration;
		this.mcpServer = ports.mcpServer;
		this.logger = ports.logger;
	}

	/** @precondition persistence.loadData 可返回持久化设置或 null @postcondition 返回可用于启动注册的基础设置快照，不触发迁移或 Markdown hydrate @throws 当关键迁移依赖失败时抛出 @example await service.loadBootstrapSettings() */
	async loadBootstrapSettings(): Promise<PluginSettings> {
		const persisted = (await this.persistence.loadData()) ?? {};
		const rawChatSettings = asRecord(persisted.chat);
		const mergedChat = buildLoadedChatSettings(rawChatSettings);
		const persistedAiRuntime = this.migration.resolvePersistedAiRuntime(persisted);
		const aiRuntimeSettings = cloneAiRuntimeSettings(
			this.secret.decryptAiRuntimeSettings(persistedAiRuntime),
		);
		deleteFields(aiRuntimeSettings as unknown as Record<string, unknown>, AI_RUNTIME_LEGACY_FIELDS);
		const aiDataFolder = this.migration.resolveAiDataFolder(persisted, rawChatSettings);

		return {
			...DEFAULT_SETTINGS,
			...omitLegacyTopLevelFields(persisted),
			aiDataFolder,
			aiRuntime: aiRuntimeSettings,
			chat: stripLegacyChatFields(mergedChat),
		};
	}

	/** @precondition settings 来自 bootstrap 阶段且包含完整基础配置 @postcondition 返回补齐 MCP Markdown 配置后的设置快照 @throws 当关键 hydrate 依赖失败且未被内部降级时抛出 @example await service.hydratePersistedSettings(settings) */
	async hydratePersistedSettings(settings: PluginSettings): Promise<PluginSettings> {
		const hydratedAiRuntime = cloneAiRuntimeSettings(settings.aiRuntime);
		try {
			const markdownServers = await this.mcpServer.loadServers(settings.aiDataFolder);
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

		return {
			...settings,
			aiRuntime: hydratedAiRuntime,
		};
	}

	/** @precondition settings 为待持久化的完整设置快照 @postcondition data.json 被更新且运行时字段不会被写回 @throws 当持久化本身失败时抛出 @example await service.save(settings) */
	async save(settings: PluginSettings): Promise<void> {
		const encryptedAiRuntime = this.secret.encryptAiRuntimeSettings(settings.aiRuntime);
		const persisted = (await this.persistence.loadData()) ?? {};
		const persistedChat = asRecord(persisted.chat);
		const persistedAiRuntime = this.migration.resolvePersistedAiRuntime(persisted);
		const mergedChat = { ...persistedChat, ...settings.chat };
		deleteFields(mergedChat, [...CHAT_RUNTIME_ONLY_FIELDS, ...CHAT_LEGACY_FIELDS]);
		const mergedAiRuntime = { ...persistedAiRuntime, ...encryptedAiRuntime };
		deleteFields(mergedAiRuntime, [...AI_RUNTIME_LEGACY_FIELDS, ...AI_RUNTIME_RUNTIME_ONLY_FIELDS]);
		const normalizedAiDataFolder =
			this.migration.normalizeLegacyFolderPath(settings.aiDataFolder)
			|| DEFAULT_SETTINGS.aiDataFolder;
		const runtimeMcpSettings: McpSettings = { ...DEFAULT_MCP_SETTINGS, ...(settings.aiRuntime.mcp ?? {}) };
		stripRemovedBuiltinMcpFields(runtimeMcpSettings as unknown as Record<string, unknown>);
		let normalizedMcpServers = runtimeMcpSettings.servers ?? [];
		try {
			normalizedMcpServers = await this.mcpServer.syncServers(
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
		await this.persistence.saveData(settingsToPersist);
	}

	/** @precondition aiDataFolder 为目标 AI 数据目录 @postcondition 通过 host port 确保目录结构存在 @throws 当创建目录失败时抛出 @example await service.ensureAiDataFolders('System/AI Data') */
	async ensureAiDataFolders(aiDataFolder: string): Promise<void> {
		await this.host.ensureAiDataFolders(aiDataFolder);
	}

	/** @precondition settings 为迁移目标设置 @postcondition 旧 AI 数据目录被迁移到新位置 @throws 当迁移依赖失败时抛出 @example await service.migrateAiDataStorage(settings) */
	async migrateAiDataStorage(settings: PluginSettings): Promise<void> {
		await this.migration.migrateAIDataStorage(settings);
	}

	/** @precondition 无 @postcondition 旧版 AI 存储残留被清理 @throws 当清理依赖失败时抛出 @example await service.cleanupLegacyAiStorage() */
	async cleanupLegacyAiStorage(): Promise<void> {
		await this.migration.cleanupLegacyAIStorage();
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

function stripRemovedBuiltinMcpFields(value: Record<string, unknown>): void {
	deleteFields(value, ['builtinVaultEnabled', 'builtinObsidianSearchEnabled', 'builtinMemoryEnabled', 'builtinSequentialThinkingEnabled', 'builtinMemoryFilePath', 'builtinSequentialThinkingDisableThoughtLogging']);
}
