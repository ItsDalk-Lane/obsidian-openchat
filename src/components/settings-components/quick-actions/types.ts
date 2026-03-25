import type { App } from 'obsidian'
import type { ProviderSettings } from 'src/types/provider'
import type { QuickAction } from 'src/types/chat'

export interface QuickActionListContext {
	app: App
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
