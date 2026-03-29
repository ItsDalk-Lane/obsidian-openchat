import type { PluginSettings } from 'src/domains/settings/types';
import { SettingsDomainService } from 'src/domains/settings/service';
import { DebugLogger } from 'src/utils/DebugLogger';
import { FeatureCoordinator } from './FeatureCoordinator';

export class PluginStartupCoordinator {
  private bootstrapSettingsPromise: Promise<PluginSettings> | null = null;
  private deferredInitializationPromise: Promise<PluginSettings> | null = null;

  constructor(
    private readonly settingsService: SettingsDomainService,
    private readonly featureCoordinator: FeatureCoordinator,
    private readonly notify: (message: string, timeout?: number) => void,
  ) {}

  loadBootstrapSettings(): Promise<PluginSettings> {
    if (!this.bootstrapSettingsPromise) {
      this.bootstrapSettingsPromise = this.settingsService.loadBootstrapSettings()
        .catch((error) => {
          this.bootstrapSettingsPromise = null;
          throw error;
        });
    }

    return this.bootstrapSettingsPromise;
  }

  runDeferredInitialization(settings: PluginSettings): Promise<PluginSettings> {
    if (!this.deferredInitializationPromise) {
      this.deferredInitializationPromise = this.executeDeferredInitialization(settings)
        .catch((error) => {
          this.deferredInitializationPromise = null;
          throw error;
        });
    }

    return this.deferredInitializationPromise;
  }

  private async executeDeferredInitialization(settings: PluginSettings): Promise<PluginSettings> {
    await this.cleanupLegacyStorage();
    await this.ensureAiDataFolders(settings.aiDataFolder);
    await this.migrateAiDataStorage(settings);
    const hydratedSettings = await this.hydratePersistedSettings(settings);
    await this.initializeMcp(hydratedSettings);
    return hydratedSettings;
  }

  private async cleanupLegacyStorage(): Promise<void> {
    try {
      await this.settingsService.cleanupLegacyAiStorage();
    } catch (error) {
      DebugLogger.error('[OpenChatPlugin] 旧版快捷操作/系统提示词清理失败（忽略）', error);
    }
  }

  private async ensureAiDataFolders(aiDataFolder: string): Promise<void> {
    try {
      await this.settingsService.ensureAiDataFolders(aiDataFolder);
    } catch (error) {
      DebugLogger.error('[OpenChatPlugin] AI数据文件夹初始化失败，将在下次保存设置时重试', error);
    }
  }

  private async migrateAiDataStorage(settings: PluginSettings): Promise<void> {
    try {
      await this.settingsService.migrateAiDataStorage(settings);
    } catch (error) {
      DebugLogger.error('[OpenChatPlugin] AI数据目录迁移失败', error);
      this.notify('AI 数据目录迁移失败，请稍后重试。');
    }
  }

  private async hydratePersistedSettings(settings: PluginSettings): Promise<PluginSettings> {
    try {
      return await this.settingsService.hydratePersistedSettings(settings);
    } catch (error) {
      DebugLogger.error('[OpenChatPlugin] 持久化设置 hydrate 失败，继续使用 bootstrap 设置', error);
      return settings;
    }
  }

  private async initializeMcp(settings: PluginSettings): Promise<void> {
    try {
      await this.featureCoordinator.initializeMcp(settings);
    } catch (error) {
      DebugLogger.error('[OpenChatPlugin] MCP 初始化失败，将在后续刷新时重试', error);

			// Chat 初始化支持在 MCP 未就绪时继续运行，相关工具会在后续刷新时重试接入。
    }
  }
}
