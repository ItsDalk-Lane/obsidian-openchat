import { Notice, Plugin } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS } from './settings/PluginSettings';
import { SettingsManager } from './settings/SettingsManager';
import { FeatureCoordinator } from './core/FeatureCoordinator';
import { PluginSettingTab } from './settings/PluginSettingTab';
import './styles/base.css'
import './styles/chat.css'
import { cloneAiRuntimeSettings } from './settings/ai-runtime';
import { DebugLogger } from './utils/DebugLogger';
import { ensureAIDataFolders } from './utils/AIPathManager';

export default class OpenChatPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;

	private settingsManager = new SettingsManager(this);
	featureCoordinator = new FeatureCoordinator(this);


	async onload() {
		await this.loadSettings();
		try {
			await this.settingsManager.cleanupLegacyAIStorage();
		} catch (error) {
			DebugLogger.error('[OpenChatPlugin] 旧版快捷操作/系统提示词清理失败（忽略）', error);
		}
		try {
			await ensureAIDataFolders(this.app, this.settings.aiDataFolder);
		} catch (error) {
			DebugLogger.error('[OpenChatPlugin] AI数据文件夹初始化失败，将在下次保存设置时重试', error);
		}
		try {
			await this.settingsManager.migrateAIDataStorage(this.settings);
		} catch (error) {
			DebugLogger.error('[OpenChatPlugin] AI数据目录迁移失败', error);
			new Notice('AI 数据目录迁移失败，请在设置中检查“AI数据总文件夹”并手动调整。');
		}

		this.addSettingTab(new PluginSettingTab(this));
		this.featureCoordinator.initializeAiRuntime(this.settings);
		await this.featureCoordinator.initializeMcp(this.settings);

		this.app.workspace.onLayoutReady(async () => {
			await this.featureCoordinator.initializeChat(this.settings);
		});
	}


	onunload() {
		this.featureCoordinator.dispose();
	}

	private async loadSettings() {
		this.settings = await this.settingsManager.load();
		this.applyDebugSettings();
	}

	async replaceSettings(value: Partial<PluginSettings>) {
		const { aiRuntime, chat, ...rest } = value;
		this.settings = {
			...this.settings,
			...rest,
			chat: { ...this.settings.chat, ...(chat ?? {}) },
			aiRuntime: cloneAiRuntimeSettings({
				...this.settings.aiRuntime,
				...(aiRuntime ?? {}),
			}),
		};
		await this.saveSettings();
	}

	async saveSettings() {
		await this.settingsManager.save(this.settings);
		await this.applyRuntimeUpdates();
	}

	/**
	 * 手动触发 AI 数据文件夹创建
	 * 由设置页面在输入框失焦且值有变化时调用
	 * @param folderPath - 可选，指定要创建的文件夹路径；为空时使用当前设置值
	 */
	async tryEnsureAIDataFolders(folderPath?: string): Promise<void> {
		try {
			await ensureAIDataFolders(this.app, folderPath ?? this.settings.aiDataFolder);
		} catch (error) {
			DebugLogger.error('[OpenChatPlugin] AI数据文件夹创建失败', error);
		}
	}

	private async applyRuntimeUpdates() {
		this.applyDebugSettings();
		await this.featureCoordinator.refresh(this.settings);
	}

	private applyDebugSettings() {
		DebugLogger.setDebugMode(this.settings.aiRuntime?.debugMode ?? false);
		DebugLogger.setDebugLevel(this.settings.aiRuntime?.debugLevel ?? 'error');
		DebugLogger.setLlmConsoleLogEnabled(this.settings.aiRuntime?.enableLlmConsoleLog ?? false);
		DebugLogger.setLlmResponsePreviewChars(this.settings.aiRuntime?.llmResponsePreviewChars ?? 100);
	}
}
