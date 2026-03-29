import { Plugin } from 'obsidian';
import type { PluginSettings } from 'src/domains/settings/types';
import { DEFAULT_SETTINGS } from 'src/domains/settings/config';
import { SettingsDomainService } from 'src/domains/settings/service';
import { FeatureCoordinator } from './core/FeatureCoordinator';
import { PluginSettingTab } from './settings/PluginSettingTab';
import { DebugLogger } from './utils/DebugLogger';
import './styles/base.css';
import './styles/chat.css';
import { PluginSettingsController } from 'src/domains/settings/ui';
import { PluginStartupCoordinator } from './core/PluginStartupCoordinator';
import { createObsidianApiProvider } from 'src/providers/obsidian-api';

export default class OpenChatPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	private readonly bootstrapObsidianApiProvider = createObsidianApiProvider(this.app, async () => '');

	featureCoordinator = new FeatureCoordinator(this);
	private bootstrapSettingsPromise: Promise<PluginSettings> | null = null;
	private settingTab: PluginSettingTab | null = null;
	private settingsDomainService = new SettingsDomainService(
		this,
		this.bootstrapObsidianApiProvider,
		DebugLogger,
	);
	private settingsController = new PluginSettingsController(
		this.settingsDomainService,
		this.featureCoordinator,
		DebugLogger,
		DebugLogger,
	);
	private startupCoordinator = new PluginStartupCoordinator(
		this.settingsDomainService,
		this.featureCoordinator,
		(message, timeout) => this.bootstrapObsidianApiProvider.notify(message, timeout),
	);


	async onload() {
		// 在任何 await 之前同步注册聊天视图类型
		// 确保 Obsidian 恢复工作区布局时能立即识别视图，消除标题栏占位图标
		this.featureCoordinator.registerChatViewTypesEarly();
		this.settingTab = new PluginSettingTab(this);
		this.addSettingTab(this.settingTab);
		this.featureCoordinator.initializeAiRuntime(this.settings);
		void this.ensureBootstrapSettingsLoaded().catch((error) => {
			DebugLogger.error('[OpenChatPlugin] 启动设置加载失败', error);
		});

		this.app.workspace.onLayoutReady(() => {
			void this.initializeDeferredFeatures().catch((error) => {
				DebugLogger.error('[OpenChatPlugin] 延迟初始化失败', error);
				this.bootstrapObsidianApiProvider.notify('延迟初始化失败，请查看日志。');
			});
		});
	}


	onunload() {
		this.featureCoordinator.dispose();
	}

	private async initializeDeferredFeatures(): Promise<void> {
		try {
			this.settings = await this.ensureBootstrapSettingsLoaded();
		} catch (error) {
			DebugLogger.error('[OpenChatPlugin] 启动设置加载失败，继续使用默认设置', error);
		}

		try {
			this.settings = await this.startupCoordinator.runDeferredInitialization(this.settings);
			this.featureCoordinator.initializeAiRuntime(this.settings);
		} catch (error) {
			DebugLogger.error('[OpenChatPlugin] 延迟初始化部分失败，继续初始化 Chat', error);
		}

		await this.featureCoordinator.initializeChat(this.settings);
	}

	async replaceSettings(value: Partial<PluginSettings>) {
		await this.ensureBootstrapSettingsLoaded();
		this.settings = await this.settingsController.replaceSettings(this.settings, value);
	}

	async saveSettings() {
		await this.ensureBootstrapSettingsLoaded();
		await this.settingsController.saveSettings(this.settings);
	}

	/**
	 * 手动触发 AI 数据文件夹创建
	 * 由设置页面在输入框失焦且值有变化时调用
	 * @param folderPath - 可选，指定要创建的文件夹路径；为空时使用当前设置值
	 */
	async tryEnsureAIDataFolders(folderPath?: string): Promise<void> {
		await this.ensureBootstrapSettingsLoaded();
		await this.settingsController.ensureAiDataFolders(folderPath ?? this.settings.aiDataFolder);
	}

	private async ensureBootstrapSettingsLoaded(): Promise<PluginSettings> {
		if (!this.bootstrapSettingsPromise) {
			this.bootstrapSettingsPromise = this.settingsController.loadBootstrapSettings()
				.then((settings) => {
					this.settings = settings;
					this.featureCoordinator.initializeAiRuntime(settings);
					if (this.settingTab?.containerEl.isConnected) {
						this.settingTab.display();
					}
					return settings;
				})
				.catch((error) => {
					this.bootstrapSettingsPromise = null;
					throw error;
				});
		}

		return await this.bootstrapSettingsPromise;
	}
}
