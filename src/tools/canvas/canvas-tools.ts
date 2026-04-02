import type { App } from 'obsidian'
import type { BuiltinTool } from '../runtime/types'
import {
	createEditCanvasTool,
	EDIT_CANVAS_TOOL_NAME,
} from './edit-canvas/tool'
import {
	createReadCanvasTool,
	READ_CANVAS_TOOL_NAME,
} from './read-canvas/tool'

export {
	EDIT_CANVAS_TOOL_NAME,
	READ_CANVAS_TOOL_NAME,
}

export const createCanvasTools = (app: App): BuiltinTool[] => [
	createReadCanvasTool(app),
	createEditCanvasTool(app),
]
