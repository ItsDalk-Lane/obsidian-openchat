import { Notice, type App } from 'obsidian';
import { localInstance } from 'src/i18n/locals';
import type { PluginSettings } from 'src/settings/PluginSettings';
import { SettingsManager } from 'src/settings/SettingsManager';
import { ensureAIDataFolders } from 'src/utils/AIPathManager';
import { DebugLogger } from 'src/utils/DebugLogger';
import { FeatureCoordinator } from './FeatureCoordinator';

export class PluginStartupCoordinator {
  private deferredInitializationPromise: Promise<void> | null = null;

  constructor(
    private readonly app: App,
    private readonly settingsManager: SettingsManager,
    private readonly featureCoordinator: FeatureCoordinator,
  ) {}

  runDeferredInitialization(settings: PluginSettings): Promise<void> {
    if (!this.deferredInitializationPromise) {
      this.deferredInitializationPromise = this.executeDeferredInitialization(settings)
        .catch((error) => {
          this.deferredInitializationPromise = null;
          throw error;
        });
    }

    return this.deferredInitializationPromise;
  }

  private async executeDeferredInitialization(settings: PluginSettings): Promise<void> {
    await this.cleanupLegacyStorage();
    await this.ensureAiDataFolders(settings.aiDataFolder);
    await this.migrateAiDataStorage(settings);
    await this.initializeMcp(settings);
  }

  private async cleanupLegacyStorage(): Promise<void> {
    try {
      await this.settingsManager.cleanupLegacyAIStorage();
    } catch (error) {
      DebugLogger.error('[OpenChatPlugin] 旧版快捷操作/系统提示词清理失败（忽略）', error);
    }
  }

  private async ensureAiDataFolders(aiDataFolder: string): Promise<void> {
    try {
      await ensureAIDataFolders(this.app, aiDataFolder);
    } catch (error) {
      DebugLogger.error('[OpenChatPlugin] AI数据文件夹初始化失败，将在下次保存设置时重试', error);
    }
  }

  private async migrateAiDataStorage(settings: PluginSettings): Promise<void> {
    try {
      await this.settingsManager.migrateAIDataStorage(settings);
    } catch (error) {
      DebugLogger.error('[OpenChatPlugin] AI数据目录迁移失败', error);
      new Notice(localInstance.ai_data_folder_migration_failed_notice);
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