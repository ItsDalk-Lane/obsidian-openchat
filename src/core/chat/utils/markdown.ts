import { App, Component, MarkdownRenderer } from 'obsidian';
export type {
	ContentBlock,
	McpToolBlock,
	ReasoningBlock,
	TextBlock,
} from 'src/domains/chat/service-content-blocks';
export {
	formatMcpToolBlock,
	parseContentBlocks,
} from 'src/domains/chat/service-content-blocks';

type ChatMarkdownContainer = HTMLElement & {
	__ffInternalLinkClickHandler?: (event: MouseEvent) => void
}

const getInternalLinkElement = (target: EventTarget | null): HTMLAnchorElement | null => {
	if (!(target instanceof HTMLElement)) {
		return null
	}
	const matched = target.closest('a.internal-link')
	return matched instanceof HTMLAnchorElement ? matched : null
}

export const attachChatInternalLinkHandler = (
	app: App,
	container: HTMLElement,
): void => {
	const host = container as ChatMarkdownContainer
	if (host.__ffInternalLinkClickHandler) {
		container.removeEventListener('click', host.__ffInternalLinkClickHandler, true)
	}

	host.__ffInternalLinkClickHandler = (event: MouseEvent) => {
		const linkEl = getInternalLinkElement(event.target)
		if (!linkEl) {
			return
		}

		const linkTarget = (linkEl.getAttribute('data-href') ?? linkEl.getAttribute('href') ?? '').trim()
		if (!linkTarget) {
			return
		}

		event.preventDefault()
		event.stopPropagation()
		event.stopImmediatePropagation()

		const sourcePath = app.workspace.getActiveFile()?.path ?? ''
		app.workspace.openLinkText(linkTarget, sourcePath, true)
	}

	container.addEventListener('click', host.__ffInternalLinkClickHandler, true)
}

// 渲染普通 Markdown 内容
export const renderMarkdownContent = async (
	app: App,
	markdown: string,
	container: HTMLElement,
	component: Component
) => {
	container.empty();
	await MarkdownRenderer.render(app, markdown, container, '', component);
	attachChatInternalLinkHandler(app, container);
};
