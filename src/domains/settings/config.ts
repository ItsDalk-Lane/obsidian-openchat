/**
 * @module settings/config
 * @description 提供 settings 域的默认值与设置合并逻辑。
 *
 * @dependencies src/domains/settings/config-ai-runtime, src/types/chat,
 *   src/domains/settings/types
 * @side-effects 无
 * @invariants 仅负责 settings 数据本身，不执行持久化。
 */

import { cloneAiRuntimeSettings } from './config-ai-runtime';
import { DEFAULT_CHAT_SETTINGS } from 'src/types/chat';
import type { PluginSettings } from './types';

export const DEFAULT_SETTINGS: PluginSettings = {
	aiDataFolder: 'System/AI Data',
	aiRuntime: cloneAiRuntimeSettings(),
	chat: DEFAULT_CHAT_SETTINGS,
};

/** @precondition currentSettings 为完整设置快照 @postcondition 返回合并 partialSettings 后的新设置对象 @throws 从不抛出 @example mergePluginSettings(DEFAULT_SETTINGS, { aiDataFolder: 'Custom/AI Data' }) */
export function mergePluginSettings(
	currentSettings: PluginSettings,
	partialSettings: Partial<PluginSettings>,
): PluginSettings {
	const { aiRuntime, chat, ...rest } = partialSettings;
	return {
		...currentSettings,
		...rest,
		chat: { ...currentSettings.chat, ...(chat ?? {}) },
		aiRuntime: cloneAiRuntimeSettings({
			...currentSettings.aiRuntime,
			...(aiRuntime ?? {}),
		}),
	};
}
