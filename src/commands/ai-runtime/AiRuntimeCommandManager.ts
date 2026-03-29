import { Extension } from '@codemirror/state'
import { t } from 'src/i18n/ai-runtime/helper'
import type { AiRuntimeSettings } from 'src/settings/ai-runtime/api'
import { StatusBarManager } from './StatusBarManager'
import { availableVendors } from 'src/settings/ai-runtime/api'
import { buildProviderOptionsWithReasoningDisabled } from 'src/LLMProviders/utils'
import { localInstance } from 'src/i18n/locals'
import { createEventBus } from 'src/providers/event-bus'
import { createEditorDomainExtension, EditorDomainController } from 'src/domains/editor/ui'
import { normalizeEditorTabCompletionSettings } from 'src/domains/editor/config'
import type { ObsidianApiProvider } from 'src/providers/providers.types'
import type {
	EditorCompletionMessage,
	EditorCompletionProvider,
	EditorTabCompletionEvents,
	EditorTabCompletionRuntime,
} from 'src/domains/editor/types'
import { DebugLogger } from 'src/utils/DebugLogger'
import type { AiRuntimeCommandHost } from './ai-runtime-command-host'

export class AiRuntimeCommandManager {
	private statusBarManager: StatusBarManager | null = null
	private aborterInstance: AbortController | null = null
	private registeredCommandIds: Set<string> = new Set()
	private tabCompletionExtensions: Extension[] = []
	private tabCompletionRegistered = false
	private readonly editorEventBus = createEventBus<EditorTabCompletionEvents>()
	private tabCompletionController: EditorDomainController | null = null

	constructor(
		private readonly host: AiRuntimeCommandHost,
		private readonly obsidianApiProvider: ObsidianApiProvider,
		private settings: AiRuntimeSettings
	) {}

	initialize() {
		this.settings.editorStatus = this.settings.editorStatus ?? { isTextInserting: false }
		const statusBarItem = this.host.addStatusBarItem()
		this.statusBarManager = new StatusBarManager(
			this.host.getApp(),
			(message, timeout) => this.host.notify(message, timeout),
			statusBarItem,
		)

		this.ensureTabCompletionRegistered()
		this.syncTabCompletionRuntime()

		this.registerCommand('cancelGeneration', {
			id: 'cancelGeneration',
			name: t('Cancel generation'),
			callback: async () => {
				this.settings.editorStatus.isTextInserting = false

				if (this.aborterInstance === null) {
					this.host.notify(t('No active generation to cancel'))
					return
				}
				if (this.aborterInstance.signal.aborted) {
					this.host.notify(t('Generation already cancelled'))
					return
				}

				this.aborterInstance.abort()
			}
		})
	}

	dispose() {
		this.registeredCommandIds.forEach((id) => this.host.removeCommand(id))
		this.registeredCommandIds.clear()

		this.disposeTabCompletion()

		this.statusBarManager?.dispose()
		this.statusBarManager = null
		this.aborterInstance = null
	}

	updateSettings(settings: AiRuntimeSettings) {
		this.settings = settings
		this.syncTabCompletionRuntime()
	}

	private registerCommand(
		id: string,
		command: Parameters<AiRuntimeCommandHost['addCommand']>[0],
		track = true
	) {
		this.host.addCommand(command)
		if (track) {
			this.registeredCommandIds.add(id)
		}
	}

	private ensureTabCompletionRegistered(): void {
		if (this.tabCompletionRegistered) {
			return
		}
		this.tabCompletionController = new EditorDomainController(
			this.obsidianApiProvider,
			this.editorEventBus,
			this.createTabCompletionRuntime(),
		)
		this.tabCompletionExtensions = createEditorDomainExtension(this.tabCompletionController)
		this.host.registerEditorExtension(this.tabCompletionExtensions)
		this.tabCompletionRegistered = true
	}

	private syncTabCompletionRuntime(): void {
		this.ensureTabCompletionRegistered()
		this.tabCompletionController?.updateRuntime(this.createTabCompletionRuntime())
	}

	private createTabCompletionRuntime(): EditorTabCompletionRuntime {
		return {
			providers: this.createCompletionProviders(),
			settings: normalizeEditorTabCompletionSettings({
				enabled: this.settings.enableTabCompletion,
				triggerKey: this.settings.tabCompletionTriggerKey,
				contextLengthBefore: this.settings.tabCompletionContextLengthBefore,
				contextLengthAfter: this.settings.tabCompletionContextLengthAfter,
				timeout: this.settings.tabCompletionTimeout,
				providerTag: this.settings.tabCompletionProviderTag,
				promptTemplate: this.settings.tabCompletionPromptTemplate,
			}),
			messages: {
				readOnly: localInstance.tab_completion_read_only,
				noProvider: localInstance.tab_completion_no_provider,
				failedDefaultReason: localInstance.tab_completion_failed_default_reason,
				failedPrefix: localInstance.tab_completion_failed_prefix,
			},
			logger: {
				debug(message: string, metadata?: unknown): void {
					DebugLogger.debug(message, metadata)
				},
				error(message: string, metadata?: unknown): void {
					DebugLogger.error(message, metadata)
				},
			},
		}
	}

	private createCompletionProviders(): EditorCompletionProvider[] {
		return this.settings.providers.flatMap((providerSettings) => {
			const vendor = availableVendors.find((candidate) => candidate.name === providerSettings.vendor)
			if (!vendor) {
				DebugLogger.error('[AiRuntimeCommandManager] Tab Completion 找不到 vendor', providerSettings.vendor)
				return []
			}
			const sendRequest = vendor.sendRequestFunc(
				buildProviderOptionsWithReasoningDisabled(providerSettings.options, providerSettings.vendor),
			)
			return [{
				tag: providerSettings.tag,
				vendor: providerSettings.vendor,
				async *sendCompletion(messages: readonly EditorCompletionMessage[], controller: AbortController): AsyncGenerator<string, void, unknown> {
					for await (const chunk of sendRequest(messages, controller, async () => new ArrayBuffer(0))) {
						yield chunk
					}
				},
			}]
		})
	}

	/**
	 * 销毁 Tab 补全功能
	 */
	private disposeTabCompletion(): void {
		if (this.tabCompletionRegistered) {
			this.tabCompletionController?.dispose()
			this.tabCompletionController = null
			this.editorEventBus.clear()
			this.tabCompletionExtensions = []
			this.tabCompletionRegistered = false
		}
	}
}
