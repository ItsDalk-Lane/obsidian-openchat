/**
 * @module settings/types
 * @description 定义 settings 域的类型与最小运行时适配接口。
 *
 * @dependencies src/settings/ai-runtime, src/types/chat
 * @side-effects 无
 * @invariants 不包含运行时代码，不依赖 UI 或命令层。
 */

import type { AiRuntimeSettings } from 'src/settings/ai-runtime';
import type { ChatSettings } from 'src/types/chat';

export interface PluginSettings {
	readonly aiDataFolder: string;
	readonly aiRuntime: AiRuntimeSettings;
	readonly chat: ChatSettings;
}

export interface SettingsPluginAdapter {
	readonly app: unknown;
	settings?: PluginSettings;
	loadData(): Promise<Record<string, unknown> | null>;
	saveData(data: unknown): Promise<void>;
}

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