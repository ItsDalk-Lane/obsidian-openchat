import { App, Modal } from 'obsidian'
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ObsidianAppContext } from 'src/contexts/obsidianAppContext'
import type { ChatService } from 'src/core/chat/services/ChatService'
import { localInstance } from 'src/i18n/locals'
import { ChatSettingsModalApp } from './ChatSettingsModalApp'
import './ChatSettingsModal.css'

export class ChatSettingsModal extends Modal {
	private root: Root | null = null

	constructor(
		app: App,
		private readonly service: ChatService,
		private readonly onRequestClose?: () => void,
	) {
		super(app)
	}

	onOpen(): void {
		const { contentEl, titleEl, modalEl } = this
		contentEl.empty()
		contentEl.addClass('chat-settings-modal-content')
		modalEl.addClass('chat-settings-modal')
		titleEl.textContent = localInstance.chat_settings_modal_title

		this.root = createRoot(contentEl)
		this.root.render(
			<StrictMode>
				<ObsidianAppContext.Provider value={this.app}>
					<ChatSettingsModalApp app={this.app} service={this.service} />
				</ObsidianAppContext.Provider>
			</StrictMode>
		)
	}

	onClose(): void {
		this.root?.unmount()
		this.root = null
		this.contentEl.empty()
		this.onRequestClose?.()
	}
}
