import type { App } from 'obsidian'
import type { QuickAction } from 'src/domains/chat/types'
import type { QuickActionDataService } from 'src/domains/quick-actions/service-data'
import type { ObsidianApiProvider } from 'src/providers/providers.types'
import type { ProviderSettings } from 'src/types/provider'

export interface QuickActionListContext {
	quickActionDataService: QuickActionDataService
	notify: (message: string, timeout?: number) => void
	quickActionGroupExpandedState: Map<string, boolean>
	getQuickActionsFromService: () => Promise<QuickAction[]>
	refreshQuickActionsCache?: () => Promise<void>
	deleteQuickAction: (quickActionId: string) => Promise<void>
	updateQuickActionShowInToolbar: (quickActionId: string, showInToolbar: boolean) => Promise<void>
	openQuickActionEditModal: (quickAction?: QuickAction) => Promise<void>
}

export interface QuickActionEditModalOptions {
	initialIsActionGroup?: boolean
	onSaved?: (savedQuickAction: QuickAction) => Promise<void> | void
}

export interface QuickActionEditModalContext {
	app: App
	obsidianApi: ObsidianApiProvider
	quickActionDataService: QuickActionDataService
	notify: (message: string, timeout?: number) => void
	providers: ProviderSettings[]
	promptTemplateFolder: string
	refreshQuickActionsCache?: () => Promise<void>
	resolveQuickActionsListContainer: () => HTMLElement | null
	getQuickActionsFromService: () => Promise<QuickAction[]>
	saveQuickAction: (quickAction: QuickAction) => Promise<void>
	refreshQuickActionsList: (container: HTMLElement) => Promise<void>
	openQuickActionEditModal: (
		quickAction?: QuickAction,
		options?: QuickActionEditModalOptions
	) => Promise<void>
}
