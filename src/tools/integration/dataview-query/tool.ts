import type { App } from 'obsidian'
import { buildBuiltinTool } from '../../runtime/build-tool'
import { DATAVIEW_QUERY_DESCRIPTION } from './description'
import {
	describeDataviewQueryActivity,
	executeDataviewQuery,
	summarizeDataviewQuery,
	validateDataviewQueryInput,
} from './service'
import {
	dataviewQueryAnnotations,
	dataviewQueryResultSchema,
	dataviewQuerySchema,
	type DataviewQueryArgs,
	type DataviewQueryResult,
} from './schema'

export const DATAVIEW_QUERY_TOOL_NAME = 'dataview_query'

export const createDataviewQueryTool = (app: App) => buildBuiltinTool<
	DataviewQueryArgs,
	DataviewQueryResult
>({
	name: DATAVIEW_QUERY_TOOL_NAME,
	title: '执行 Dataview 查询',
	description: DATAVIEW_QUERY_DESCRIPTION,
	inputSchema: dataviewQuerySchema,
	outputSchema: dataviewQueryResultSchema,
	annotations: dataviewQueryAnnotations,
	surface: {
		family: 'builtin.integration.dataview',
		visibility: 'candidate-only',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '在已安装 Dataview 插件时执行只读查询。',
		whenToUse: [
			'需要执行 TABLE、LIST、TASK 等 Dataview 查询',
			'需要按标签、frontmatter 或文件元数据筛选笔记',
		],
		whenNotToUse: [
			'Vault 未安装 Dataview 时不要使用',
			'全文关键词搜索请改用 search_content',
			'修改笔记内容时不要使用当前工具',
		],
		capabilityTags: [
			'dataview',
			'query',
			'table',
			'list',
			'task',
			'查询',
		],
		requiredArgsSummary: ['query'],
	},
	runtimePolicy: {
		contextDefaults: [
			{ field: 'origin_file_path', source: 'selected-text-file-path' },
			{ field: 'origin_file_path', source: 'active-file-path' },
		],
	},
	isReadOnly: () => true,
	isConcurrencySafe: () => true,
	validateInput: (args) => validateDataviewQueryInput(app, args),
	getToolUseSummary: summarizeDataviewQuery,
	getActivityDescription: describeDataviewQueryActivity,
	execute: async (args) => await executeDataviewQuery(app, args),
})
