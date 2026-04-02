import type { App } from 'obsidian'
import { buildBuiltinTool } from '../../runtime/build-tool'
import { EDIT_CANVAS_DESCRIPTION } from './description'
import {
	checkEditCanvasPermissions,
	describeEditCanvasActivity,
	executeEditCanvas,
	isDestructiveEditCanvas,
	summarizeEditCanvas,
	validateEditCanvasInput,
} from './service'
import {
	editCanvasAnnotations,
	editCanvasResultSchema,
	editCanvasSchema,
	type EditCanvasArgs,
	type EditCanvasResult,
} from './schema'

export const EDIT_CANVAS_TOOL_NAME = 'edit_canvas'

export const createEditCanvasTool = (app: App) => buildBuiltinTool<
	EditCanvasArgs,
	EditCanvasResult
>({
	name: EDIT_CANVAS_TOOL_NAME,
	title: '编辑 Canvas',
	description: EDIT_CANVAS_DESCRIPTION,
	inputSchema: editCanvasSchema,
	outputSchema: editCanvasResultSchema,
	annotations: editCanvasAnnotations,
	surface: {
		family: 'builtin.canvas.write',
		source: 'workflow',
		visibility: 'workflow-only',
		argumentComplexity: 'medium',
		riskLevel: 'mutating',
		oneLinePurpose: '结构化修改 Obsidian Canvas 的节点、位置和连线。',
		whenToUse: [
			'已经知道目标 Canvas 和节点/连线 id',
			'需要通过结构化操作修改 Canvas',
		],
		whenNotToUse: [
			'只读理解请改用 read_canvas',
			'普通 Markdown 文本编辑不要使用当前工具',
		],
		capabilityTags: [
			'canvas',
			'edit canvas',
			'nodes',
			'edges',
			'workflow',
			'画布',
			'编辑画布',
		],
		requiredArgsSummary: ['file_path', 'operations'],
	},
	runtimePolicy: {
		contextDefaults: [
			{ field: 'file_path', source: 'selected-text-file-path' },
			{ field: 'file_path', source: 'active-file-path' },
		],
	},
	isReadOnly: () => false,
	isDestructive: isDestructiveEditCanvas,
	isConcurrencySafe: () => false,
	validateInput: validateEditCanvasInput,
	checkPermissions: async (args) => await checkEditCanvasPermissions(app, args),
	getToolUseSummary: summarizeEditCanvas,
	getActivityDescription: describeEditCanvasActivity,
	execute: async (args) => await executeEditCanvas(app, args),
})
