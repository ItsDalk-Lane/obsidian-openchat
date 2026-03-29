import type { BaseOptions } from './provider-shared'

export type ContentItem =
	| {
			type: 'image_url'
			image_url: {
				url: string
			}
		}
	| { type: 'text'; text: string }

export interface PoeOptions extends BaseOptions {
	enableReasoning?: boolean
	enableWebSearch?: boolean
}

export interface PoeFunctionCallItem {
	id: string
	call_id: string
	name: string
	arguments: string
}

export interface PoeToolResultMarker {
	toolName: string
	content: string
}
