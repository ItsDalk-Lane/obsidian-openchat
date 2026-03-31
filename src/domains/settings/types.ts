/**
 * @module settings/types
 * @description 定义 settings 域的类型、端口契约与最小运行时适配接口。
 *
 * @dependencies src/domains/settings/types-ai-runtime, src/types/chat
 * @side-effects 无
 * @invariants 不包含运行时代码，不依赖 UI 或命令层。
 *
 * @migration AiRuntimeSettings 已归属 settings 域；legacy
 *   src/settings/ai-runtime/* 仅保留兼容 shim。
 *   src/types/chat.ts 也已退为纯 shim；由于 domains 不允许跨域直接依赖，
 *   settings 域通过该共享类型入口消费 ChatSettings 契约。
 */

import type { AiRuntimeSettings } from './types-ai-runtime';
import type { ChatSettings } from 'src/types/chat';

export interface PluginSettings {
	readonly aiDataFolder: string;
	aiRuntime: AiRuntimeSettings;
	chat: ChatSettings;
}

// ── 持久化端口 ──────────────────────────────────────

/** settings 域所需的数据持久化能力（由组合根注入） */
export interface SettingsPersistencePort {
	loadData(): Promise<Record<string, unknown> | null>;
	saveData(data: unknown): Promise<void>;
}

// ── 宿主能力端口（窄接口） ────────────────────────────

/** settings 域所需的最小宿主能力：AI 数据目录初始化 */
export interface SettingsHostPort {
	ensureAiDataFolders(aiDataFolder: string): Promise<void>;
}

// ── 业务端口 ────────────────────────────────────────

/** API 密钥加解密端口 */
export interface SettingsSecretPort {
	decryptAiRuntimeSettings(
		settings?: Partial<AiRuntimeSettings> | Record<string, unknown>,
	): AiRuntimeSettings;
	encryptAiRuntimeSettings(settings: AiRuntimeSettings): AiRuntimeSettings;
}

/** 旧数据迁移端口 */
export interface SettingsMigrationPort {
	resolvePersistedAiRuntime(persisted: Record<string, unknown>): Record<string, unknown>;
	resolveAiDataFolder(
		persisted: Record<string, unknown>,
		rawChatSettings: Record<string, unknown>,
	): string;
	normalizeLegacyFolderPath(value: unknown): string | undefined;
	migrateAIDataStorage(settings: PluginSettings): Promise<void>;
	cleanupLegacyAIStorage(): Promise<void>;
}

/** MCP 服务器 Markdown 数据同步端口（由组合根在宿主侧预创建） */
export interface SettingsMcpServerPort {
	loadServers(aiDataFolder: string): Promise<unknown[]>;
	syncServers(aiDataFolder: string, servers: unknown[]): Promise<unknown[]>;
}

// ── 兼容类型（过渡期保留，供组合根创建 adapter 时使用） ──

/**
 * @deprecated 仅供组合根将 Plugin 实例适配为 SettingsPersistencePort + SettingsMigrationPort。
 * domain service 不再直接依赖此接口。
 */
export interface SettingsPluginAdapter {
	readonly app: unknown;
	settings?: PluginSettings;
	loadData(): Promise<Record<string, unknown> | null>;
	saveData(data: unknown): Promise<void>;
}

// ── 基础设施接口 ────────────────────────────────────

export interface SettingsDomainLogger {
	debug(message: string, metadata?: unknown): void;
	info(message: string, metadata?: unknown): void;
	warn(message: string, metadata?: unknown): void;
	error(message: string, metadata?: unknown): void;
}

export interface SettingsRefreshCoordinator {
	refresh(settings: PluginSettings): Promise<void>;
}

export interface SettingsDebugAdapter {
	setDebugMode(enabled: boolean): void;
	setDebugLevel(level: string): void;
	setLlmConsoleLogEnabled(enabled: boolean): void;
	setLlmResponsePreviewChars(length: number): void;
}
