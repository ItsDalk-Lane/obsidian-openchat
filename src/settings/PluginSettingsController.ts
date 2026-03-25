import type { FeatureCoordinator } from 'src/core/FeatureCoordinator';
import type OpenChatPlugin from 'src/main';
import { ensureAIDataFolders } from 'src/utils/AIPathManager';
import { DebugLogger } from 'src/utils/DebugLogger';
import { cloneAiRuntimeSettings } from './ai-runtime';
import type { PluginSettings } from './PluginSettings';
import { SettingsManager } from './SettingsManager';

export class PluginSettingsController {
  constructor(
    private readonly plugin: OpenChatPlugin,
    private readonly settingsManager: SettingsManager,
    private readonly featureCoordinator: FeatureCoordinator,
  ) {}

  async loadSettings(): Promise<PluginSettings> {
    const settings = await this.settingsManager.load();
    this.applyDebugSettings(settings);
    return settings;
  }

  async replaceSettings(
    currentSettings: PluginSettings,
    value: Partial<PluginSettings>,
  ): Promise<PluginSettings> {
    const { aiRuntime, chat, ...rest } = value;
    const nextSettings: PluginSettings = {
      ...currentSettings,
      ...rest,
      chat: { ...currentSettings.chat, ...(chat ?? {}) },
      aiRuntime: cloneAiRuntimeSettings({
        ...currentSettings.aiRuntime,
        ...(aiRuntime ?? {}),
      }),
    };

    await this.saveSettings(nextSettings);
    return nextSettings;
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    this.applyDebugSettings(settings);
    await this.settingsManager.save(settings);
    await this.featureCoordinator.refresh(settings);
  }

  async ensureAiDataFolders(folderPath: string): Promise<void> {
    try {
      await ensureAIDataFolders(this.plugin.app, folderPath);
    } catch (error) {
      DebugLogger.error('[OpenChatPlugin] AI数据文件夹创建失败', error);
    }
  }

  private applyDebugSettings(settings: PluginSettings): void {
    DebugLogger.setDebugMode(settings.aiRuntime?.debugMode ?? false);
    DebugLogger.setDebugLevel(settings.aiRuntime?.debugLevel ?? 'error');
    DebugLogger.setLlmConsoleLogEnabled(settings.aiRuntime?.enableLlmConsoleLog ?? false);
    DebugLogger.setLlmResponsePreviewChars(settings.aiRuntime?.llmResponsePreviewChars ?? 100);
  }
}