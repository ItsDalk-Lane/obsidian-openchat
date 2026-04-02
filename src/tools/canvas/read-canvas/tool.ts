import type { App } from 'obsidian'
import { buildBuiltinTool } from '../../runtime/build-tool'
import { READ_CANVAS_DESCRIPTION } from './description'
import {
	describeReadCanvasActivity,
	executeReadCanvas,
	summarizeReadCanvas,
	validateReadCanvasInput,
} from './service'
import {
	readCanvasAnnotations,
	readCanvasResultSchema,
	readCanvasSchema,
	type ReadCanvasArgs,
	type ReadCanvasResult,
} from './schema'

export const READ_CANVAS_TOOL_NAME = 'read_canvas'

export const createReadCanvasTool = (app: App) => buildBuiltinTool<
	ReadCanvasArgs,
	ReadCanvasResult
>({
	name: READ_CANVAS_TOOL_NAME,
	title: '读取 Canvas',
	description: READ_CANVAS_DESCRIPTION,
	inputSchema: readCanvasSchema,
	outputSchema: readCanvasResultSchema,
	annotations: readCanvasAnnotations,
	surface: {
		family: 'builtin.canvas.read',
		visibility: 'candidate-only',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '读取 Obsidian Canvas 的节点、连线与布局摘要。',
		whenToUse: [
			'需要理解某个 Canvas 的结构关系',
			'需要在修改前先读取 Canvas',
		],
		whenNotToUse: [
			'修改 Canvas 请改用 edit_canvas',
			'普通文本文件请不要使用当前工具',
		],
		capabilityTags: [
			'canvas',
			'read canvas',
			'nodes',
			'edges',
			'画布',
			'读取画布',
		],
		requiredArgsSummary: ['file_path'],
	},
	runtimePolicy: {
		contextDefaults: [
			{ field: 'file_path', source: 'selected-text-file-path' },
			{ field: 'file_path', source: 'active-file-path' },
		],
	},
	isReadOnly: () => true,
	isConcurrencySafe: () => true,
	validateInput: validateReadCanvasInput,
	getToolUseSummary: summarizeReadCanvas,
	getActivityDescription: describeReadCanvasActivity,
	execute: async (args) => await executeReadCanvas(app, args),
})
