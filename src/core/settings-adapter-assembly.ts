/**
 * @module core/settings-adapter-assembly
 * @description 组装 settings 域所需的端口实现。
 *   将 legacy 具体实现（SettingsSecretManager、SettingsMigrationService、
 *   SystemPromptDataService、McpServerDataService）包装为域定义的端口契约，
 *   并由组合根在插件启动时调用。
 *
 * @dependencies obsidian (通过 App 类型), legacy settings services, src/domains/settings/types
 * @side-effects 无（纯工厂函数，副作用在端口调用时发生）
 * @invariants settings 域不直接导入此文件；此文件只在 main.ts 组合根中被引用。
 */

import type { App } from 'obsidian';
import type {
	SettingsHostPort,
	SettingsMcpServerPort,
	SettingsMigrationPort,
	SettingsPersistencePort,
	SettingsSecretPort,
	SettingsSystemPromptPort,
} from 'src/domains/settings/types';
import type { SettingsDomainPorts } from 'src/domains/settings/service';
import type { SettingsDomainLogger } from 'src/domains/settings/types';
import type { ObsidianApiProvider, VaultPathPort } from 'src/providers/providers.types';
import { SettingsSecretManager } from 'src/settings/SettingsSecretManager';
import { SettingsMigrationService } from 'src/settings/SettingsMigrationService';

// ── 持久化端口 ──────────────────────────────────────

interface PluginDataAdapter {
	loadData(): Promise<Record<string, unknown> | null>;
	saveData(data: unknown): Promise<void>;
}

export function createSettingsPersistencePort(
	adapter: PluginDataAdapter,
): SettingsPersistencePort {
	return {
		loadData: () => adapter.loadData(),
		saveData: (data) => adapter.saveData(data),
	};
}

// ── 宿主能力端口 ────────────────────────────────────

export function createSettingsHostPort(
	obsidianApi: VaultPathPort,
): SettingsHostPort {
	return {
		ensureAiDataFolders: (aiDataFolder) =>
			obsidianApi.ensureAiDataFolders(aiDataFolder),
	};
}

// ── Secret 端口 ─────────────────────────────────────

export function createSettingsSecretPort(): SettingsSecretPort {
	const manager = new SettingsSecretManager();
	return {
		decryptAiRuntimeSettings: (settings) =>
			manager.decryptAiRuntimeSettings(settings),
		encryptAiRuntimeSettings: (settings) =>
			manager.encryptAiRuntimeSettings(settings),
	};
}

// ── 迁移端口 ────────────────────────────────────────

interface MigrationPluginLike {
	readonly app: App;
	loadData(): Promise<Record<string, unknown> | null>;
	saveData(data: unknown): Promise<void>;
	settings?: unknown;
}

/**
 * 创建迁移端口。legacy SettingsMigrationService 需要 Plugin 实例，
 * 因此由组合根传入整个 plugin 引用，但对 domain service 只暴露窄端口。
 */
export function createSettingsMigrationPort(
	pluginLike: MigrationPluginLike,
): SettingsMigrationPort {
	type MigrationPlugin = ConstructorParameters<typeof SettingsMigrationService>[0];
	const service = new SettingsMigrationService(pluginLike as MigrationPlugin);
	return {
		resolvePersistedAiRuntime: (persisted) =>
			service.resolvePersistedAiRuntime(persisted),
		resolveAiDataFolder: (persisted, rawChatSettings) =>
			service.resolveAiDataFolder(persisted, rawChatSettings),
		normalizeLegacyFolderPath: (value) =>
			service.normalizeLegacyFolderPath(value),
		migrateAIDataStorage: (settings) =>
			service.migrateAIDataStorage(settings),
		cleanupLegacyAIStorage: () =>
			service.cleanupLegacyAIStorage(),
	};
}

// ── 系统提示词端口 ──────────────────────────────────

export function createSettingsSystemPromptPort(
	app: App,
): SettingsSystemPromptPort {
	let servicePromise: Promise<SettingsSystemPromptPort> | null = null;

	function getService(): Promise<SettingsSystemPromptPort> {
		if (!servicePromise) {
			servicePromise = import(
				'src/settings/system-prompts/SystemPromptDataService'
			).then(({ SystemPromptDataService }) => {
				type SystemPromptApp = Parameters<typeof SystemPromptDataService.getInstance>[0];
				return SystemPromptDataService.getInstance(app as SystemPromptApp);
			}).catch((error) => {
				servicePromise = null;
				throw error;
			});
		}
		return servicePromise;
	}

	return {
		migrateFromLegacyDefaultSystemMessage: async (params) => {
			const service = await getService();
			return service.migrateFromLegacyDefaultSystemMessage(params);
		},
	};
}

// ── MCP 服务器数据端口 ──────────────────────────────

export function createSettingsMcpServerPort(
	app: App,
): SettingsMcpServerPort {
	let servicePromise: Promise<SettingsMcpServerPort> | null = null;

	function getService(): Promise<SettingsMcpServerPort> {
		if (!servicePromise) {
			servicePromise = import(
				'src/services/mcp/McpServerDataService'
			).then(({ McpServerDataService }) => {
				type McpApp = Parameters<typeof McpServerDataService.getInstance>[0];
				return McpServerDataService.getInstance(app as McpApp);
			}).catch((error) => {
				servicePromise = null;
				throw error;
			});
		}
		return servicePromise;
	}

	return {
		loadServers: async (aiDataFolder) => {
			const service = await getService();
			return service.loadServers(aiDataFolder);
		},
		syncServers: async (aiDataFolder, servers) => {
			const service = await getService();
			return service.syncServers(aiDataFolder, servers);
		},
	};
}

// ── 一站式组装 ──────────────────────────────────────

interface SettingsAssemblyDeps {
	readonly app: App;
	readonly plugin: PluginDataAdapter & MigrationPluginLike;
	readonly obsidianApi: ObsidianApiProvider;
	readonly logger: SettingsDomainLogger;
}

/** 在组合根中一次性组装 settings 域所需的全部端口 */
export function assembleSettingsDomainPorts(
	deps: SettingsAssemblyDeps,
): SettingsDomainPorts {
	return {
		persistence: createSettingsPersistencePort(deps.plugin),
		host: createSettingsHostPort(deps.obsidianApi),
		secret: createSettingsSecretPort(),
		migration: createSettingsMigrationPort(deps.plugin),
		systemPrompt: createSettingsSystemPromptPort(deps.app),
		mcpServer: createSettingsMcpServerPort(deps.app),
		logger: deps.logger,
	};
}
