import { Extension } from '@codemirror/state'
import { Notice, Plugin } from 'obsidian'
import { RequestController } from 'src/types/ai-runtime'
import { t } from 'src/i18n/ai-runtime/helper'
import { ProviderSettings } from 'src/types/provider'
import { AiRuntimeSettings } from 'src/settings/ai-runtime'
import { StatusBarManager } from './StatusBarManager'
import {
	createTabCompletionExtension,
	updateTabCompletionSettings,
	updateTabCompletionProviders,
	disposeTabCompletionService,
	TabCompletionSettings
} from 'src/editor/tabCompletion'

export class AiRuntimeCommandManager {
	private statusBarManager: StatusBarManager | null = null
	private aborterInstance: AbortController | null = null
	private registeredCommandIds: Set<string> = new Set()
	private tabCompletionExtensions: Extension[] = []
	private tabCompletionRegistered: boolean = false

	constructor(
		private readonly plugin: Plugin,
		private settings: AiRuntimeSettings
	) {}

	initialize() {
		this.settings.editorStatus = this.settings.editorStatus ?? { isTextInserting: false }
		const statusBarItem = this.plugin.addStatusBarItem()
		this.statusBarManager = new StatusBarManager(this.plugin.app, statusBarItem)

		this.syncTabCompletion()

		this.registerCommand('cancelGeneration', {
			id: 'cancelGeneration',
			name: t('Cancel generation'),
			callback: async () => {
				this.settings.editorStatus.isTextInserting = false

				if (this.aborterInstance === null) {
					new Notice(t('No active generation to cancel'))
					return
				}
				if (this.aborterInstance.signal.aborted) {
					new Notice(t('Generation already cancelled'))
					return
				}

				this.aborterInstance.abort()
			}
		})
	}

	dispose() {
		this.registeredCommandIds.forEach((id) => this.plugin.removeCommand(id))
		this.registeredCommandIds.clear()

		this.disposeTabCompletion()

		this.statusBarManager?.dispose()
		this.statusBarManager = null
		this.aborterInstance = null
	}

	updateSettings(settings: AiRuntimeSettings) {
		// 检测 provider 是否有实质性变化（API key、baseURL、model 等）
		const hasProviderChanges = this.hasProviderConfigChanges(this.settings.providers, settings.providers)

		// 检测 Tab 补全设置是否有变化
		const hasTabCompletionChanges = this.hasTabCompletionChanges(this.settings, settings)

		this.settings = settings

		// 无论怎样都同步 providers 到 TabCompletionService，避免某些场景下内存中的 providers 不跟随设置变化（导致需要重启才能生效）
		updateTabCompletionProviders(settings.providers)
		
		// 处理 Tab 补全设置变化
		if (hasTabCompletionChanges) {
			this.syncTabCompletion()
		} else {
			// 只更新设置，不重新注册扩展
			updateTabCompletionSettings(this.getTabCompletionSettings())
		}
	}

	/**
	 * 检测 provider 配置是否有实质性变化
	 */
	private hasProviderConfigChanges(oldProviders: ProviderSettings[], newProviders: ProviderSettings[]): boolean {
		if (oldProviders.length !== newProviders.length) {
			return true
		}

		for (let i = 0; i < oldProviders.length; i++) {
			const oldProvider = oldProviders[i]
			const newProvider = newProviders[i]

			// 检查关键配置是否变化
				if (
					oldProvider.tag !== newProvider.tag ||
					oldProvider.vendor !== newProvider.vendor ||
				oldProvider.options.apiKey !== newProvider.options.apiKey ||
				oldProvider.options.baseURL !== newProvider.options.baseURL ||
					oldProvider.options.model !== newProvider.options.model ||
					JSON.stringify(oldProvider.options.parameters) !== JSON.stringify(newProvider.options.parameters)
				) {
					return true
				}
		}

		return false
	}

	private registerCommand(
		id: string,
		command: Parameters<Plugin['addCommand']>[0],
		track: boolean = true
	) {
		this.plugin.addCommand(command)
		if (track) {
			this.registeredCommandIds.add(id)
		}
	}

	private getRequestController(): RequestController {
		return {
			getController: () => {
				if (!this.aborterInstance) {
					this.aborterInstance = new AbortController()
				}
				return this.aborterInstance
			},
			cleanup: () => {
				this.settings.editorStatus.isTextInserting = false
				this.aborterInstance = null
			}
		}
	}

	/**
	 * 从 AiRuntimeSettings 提取 Tab 补全设置
	 */
	private getTabCompletionSettings(): TabCompletionSettings {
		return {
			enabled: this.settings.enableTabCompletion ?? false,
			triggerKey: this.settings.tabCompletionTriggerKey ?? 'Alt',
			contextLengthBefore: this.settings.tabCompletionContextLengthBefore ?? 1000,
			contextLengthAfter: this.settings.tabCompletionContextLengthAfter ?? 500,
			timeout: this.settings.tabCompletionTimeout ?? 5000,
			providerTag: this.settings.tabCompletionProviderTag ?? '',
			promptTemplate: this.settings.tabCompletionPromptTemplate ?? '{{rules}}\n\n{{context}}'
		}
	}

	/**
	 * 检测 Tab 补全设置是否有实质性变化
	 */
	private hasTabCompletionChanges(oldSettings: AiRuntimeSettings, newSettings: AiRuntimeSettings): boolean {
		return (
			oldSettings.enableTabCompletion !== newSettings.enableTabCompletion ||
			oldSettings.tabCompletionTriggerKey !== newSettings.tabCompletionTriggerKey
		)
	}

	/**
	 * 同步 Tab 补全功能
	 */
	private syncTabCompletion(): void {
		const tabCompletionSettings = this.getTabCompletionSettings()

		if (!tabCompletionSettings.enabled) {
			// 功能被禁用，移除扩展
			this.disposeTabCompletion()
			return
		}

		// 如果已经注册，需要先移除（因为快捷键可能变化）
		if (this.tabCompletionRegistered) {
			this.disposeTabCompletion()
		}

		// 创建并注册新的扩展
		this.tabCompletionExtensions = createTabCompletionExtension(
			this.plugin.app,
			this.settings.providers,
			tabCompletionSettings
		)

		// 注册到 Obsidian
		this.plugin.registerEditorExtension(this.tabCompletionExtensions)
		this.tabCompletionRegistered = true

	}

	/**
	 * 销毁 Tab 补全功能
	 */
	private disposeTabCompletion(): void {
		if (this.tabCompletionRegistered) {
			disposeTabCompletionService()
			// 注意：Obsidian 的 registerEditorExtension 没有提供取消注册的方法
			// 扩展会在插件卸载时自动清理
			// 但我们可以通过清空扩展数组来标记状态
			this.tabCompletionExtensions = []
			this.tabCompletionRegistered = false
		}
	}
}
