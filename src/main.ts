import { Notice, Plugin } from 'obsidian';
import { localInstance } from 'src/i18n/locals';
import { PluginSettings, DEFAULT_SETTINGS } from './settings/PluginSettings';
import { SettingsManager } from './settings/SettingsManager';
import { FeatureCoordinator } from './core/FeatureCoordinator';
import { PluginSettingTab } from './settings/PluginSettingTab';
import { DebugLogger } from './utils/DebugLogger';
import './styles/base.css';
import './styles/chat.css';
import { PluginSettingsController } from './settings/PluginSettingsController';
import { PluginStartupCoordinator } from './core/PluginStartupCoordinator';

export default class OpenChatPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;

	private settingsManager = new SettingsManager(this);
	featureCoordinator = new FeatureCoordinator(this);
	private settingsController = new PluginSettingsController(this, this.settingsManager, this.featureCoordinator);
	private startupCoordinator = new PluginStartupCoordinator(this.app, this.settingsManager, this.featureCoordinator);


	async onload() {
		// 在任何 await 之前同步注册聊天视图类型
		// 确保 Obsidian 恢复工作区布局时能立即识别视图，消除标题栏占位图标
		this.featureCoordinator.registerChatViewTypesEarly();

		this.settings = await this.settingsController.loadSettings();
		this.addSettingTab(new PluginSettingTab(this));
		this.featureCoordinator.initializeAiRuntime(this.settings);

		this.app.workspace.onLayoutReady(() => {
			void this.initializeDeferredFeatures().catch((error) => {
				DebugLogger.error('[OpenChatPlugin] 延迟初始化失败', error);
				new Notice(localInstance.plugin_deferred_initialization_failed_notice);
			});
		});
	}


	onunload() {
		this.featureCoordinator.dispose();
	}

	private async initializeDeferredFeatures(): Promise<void> {
		try {
			await this.startupCoordinator.runDeferredInitialization(this.settings);
		} catch (error) {
			DebugLogger.error('[OpenChatPlugin] 延迟初始化部分失败，继续初始化 Chat', error);
		}

		await this.featureCoordinator.initializeChat(this.settings);
	}

	async replaceSettings(value: Partial<PluginSettings>) {
		this.settings = await this.settingsController.replaceSettings(this.settings, value);
	}

	async saveSettings() {
		await this.settingsController.saveSettings(this.settings);
	}

	/**
	 * 手动触发 AI 数据文件夹创建
	 * 由设置页面在输入框失焦且值有变化时调用
	 * @param folderPath - 可选，指定要创建的文件夹路径；为空时使用当前设置值
	 */
	async tryEnsureAIDataFolders(folderPath?: string): Promise<void> {
		await this.settingsController.ensureAiDataFolders(folderPath ?? this.settings.aiDataFolder);
	}
}
