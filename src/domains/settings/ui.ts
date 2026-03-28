/**
 * @module settings/ui
 * @description 提供 settings 域的控制器壳，连接设置服务与外部协调器。
 *
 * @dependencies src/domains/settings/types, src/domains/settings/config, src/domains/settings/service
 * @side-effects 刷新功能协调器、调整调试开关、初始化 AI 数据目录
 * @invariants 不直接操作 data.json，持久化交由 service 处理。
 */

import { mergePluginSettings } from './config';
import { SettingsDomainService } from './service';
import type {
	PluginSettings,
	SettingsDebugAdapter,
	SettingsDomainLogger,
	SettingsRefreshCoordinator,
} from './types';

/**
 * @precondition settingsService、refreshCoordinator 与 debugAdapter 由组合根注入
 * @postcondition 提供 settings 域与外层插件生命周期之间的最小控制器接缝
 * @throws 从不抛出
 */
export class PluginSettingsController {
	constructor(
		private readonly settingsService: SettingsDomainService,
		private readonly refreshCoordinator: SettingsRefreshCoordinator,
		private readonly debugAdapter: SettingsDebugAdapter,
		private readonly logger: Pick<SettingsDomainLogger, 'error'>,
	) {}

	/** @precondition settingsService 可成功读取持久化设置 @postcondition 返回完整设置并同步调试开关 @throws 当底层 load 失败时抛出 @example await controller.loadSettings() */
	async loadSettings(): Promise<PluginSettings> {
		const settings = await this.settingsService.load();
		this.applyDebugSettings(settings);
		return settings;
	}

	/** @precondition currentSettings 为当前完整设置快照 @postcondition 返回保存后的新设置并触发运行时刷新 @throws 当保存失败时抛出 @example await controller.replaceSettings(currentSettings, { aiDataFolder: 'Custom/AI Data' }) */
	async replaceSettings(currentSettings: PluginSettings, partialSettings: Partial<PluginSettings>): Promise<PluginSettings> {
		const nextSettings = mergePluginSettings(currentSettings, partialSettings);
		await this.saveSettings(nextSettings);
		return nextSettings;
	}

	/** @precondition settings 为要应用的新设置 @postcondition 设置被保存并通知外层协调器刷新 @throws 当保存或刷新失败时抛出 @example await controller.saveSettings(settings) */
	async saveSettings(settings: PluginSettings): Promise<void> {
		this.applyDebugSettings(settings);
		await this.settingsService.save(settings);
		await this.refreshCoordinator.refresh(settings);
	}

	/** @precondition folderPath 为需要确保存在的 AI 数据目录 @postcondition 成功时目录存在，失败时记录错误但不抛出 @throws 从不抛出 @example await controller.ensureAiDataFolders('System/AI Data') */
	async ensureAiDataFolders(folderPath: string): Promise<void> {
		try {
			await this.settingsService.ensureAiDataFolders(folderPath);
		} catch (error) {
			this.logger.error('[SettingsDomain] AI 数据文件夹创建失败', error);
		}
	}

	/** @precondition settings.aiRuntime 提供完整调试配置 @postcondition 调试适配器同步为当前设置值 @throws 从不抛出 @example controller['applyDebugSettings'](settings) */
	private applyDebugSettings(settings: PluginSettings): void {
		this.debugAdapter.setDebugMode(settings.aiRuntime?.debugMode ?? false);
		this.debugAdapter.setDebugLevel(settings.aiRuntime?.debugLevel ?? 'error');
		this.debugAdapter.setLlmConsoleLogEnabled(settings.aiRuntime?.enableLlmConsoleLog ?? false);
		this.debugAdapter.setLlmResponsePreviewChars(settings.aiRuntime?.llmResponsePreviewChars ?? 100);
	}
}