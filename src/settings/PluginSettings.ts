import { cloneAiRuntimeSettings } from 'src/settings/ai-runtime';
import type { AiRuntimeSettings } from 'src/settings/ai-runtime';
import type { ChatSettings } from 'src/types/chat';
import { DEFAULT_CHAT_SETTINGS } from 'src/types/chat';

export interface PluginSettings {
	aiDataFolder: string;

	aiRuntime: AiRuntimeSettings;

	chat: ChatSettings;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	aiDataFolder: 'System/AI Data',
	aiRuntime: cloneAiRuntimeSettings(),
	chat: DEFAULT_CHAT_SETTINGS,
};
