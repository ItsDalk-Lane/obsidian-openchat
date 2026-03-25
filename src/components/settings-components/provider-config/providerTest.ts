import { Notice } from 'obsidian'
import { t } from 'src/i18n/ai-runtime/helper'
import type { BaseOptions, Message, ProviderSettings, ResolveEmbedAsBinary, Vendor } from 'src/types/provider'
import { DebugLogger } from 'src/utils/DebugLogger'

interface TestProviderConfigurationParams {
	provider: ProviderSettings
	vendor: Vendor
	getVendorApiKey: (vendor: string) => string
}

export const testProviderConfiguration = async (
	params: TestProviderConfigurationParams
): Promise<boolean> => {
	new Notice(t('Testing model...'))

	try {
		const providerOptions: BaseOptions = {
			...params.provider.options,
			apiKey: params.getVendorApiKey(params.provider.vendor)
		}
		const sendRequest = params.vendor.sendRequestFunc(providerOptions)
		const controller = new AbortController()
		const resolveEmbed: ResolveEmbedAsBinary = async () => {
			throw new Error(t('Model test embed unsupported'))
		}
		const saveAttachment = async (filename: string, data: ArrayBuffer) => {
			DebugLogger.debug(
				`[Test Mode] Would save file: ${filename}, size: ${data.byteLength} bytes`
			)
		}
		const messages: Message[] = [
			{ role: 'system', content: t('Model test system prompt') },
			{ role: 'user', content: t('Model test user prompt') }
		]
		let received = ''
		for await (const chunk of sendRequest(messages, controller, resolveEmbed, saveAttachment)) {
			received += chunk
			if (received.length > 2000) {
				received = received.slice(0, 2000)
			}
		}
		if (received.trim().length === 0) {
			throw new Error(t('Model test empty response'))
		}
		new Notice(t('Model test succeeded'))
		return true
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (error instanceof Error && error.name === 'AbortError') {
			new Notice(t('Model test succeeded'))
			return true
		}
		new Notice(`${t('Model test failed')}: ${message}`)
		return false
	}
}
