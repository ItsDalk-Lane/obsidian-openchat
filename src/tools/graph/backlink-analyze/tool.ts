import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { BACKLINK_ANALYZE_DESCRIPTION } from './description';
import {
	describeBacklinkAnalyzeActivity,
	executeBacklinkAnalyze,
	summarizeBacklinkAnalyze,
	validateBacklinkAnalyzeInput,
} from './service';
import {
	backlinkAnalyzeAnnotations,
	backlinkAnalyzeResultSchema,
	backlinkAnalyzeSchema,
	type BacklinkAnalyzeArgs,
	type BacklinkAnalyzeResult,
} from './schema';

export const BACKLINK_ANALYZE_TOOL_NAME = 'backlink_analyze';

export const createBacklinkAnalyzeTool = (app: App) => buildBuiltinTool<
	BacklinkAnalyzeArgs,
	BacklinkAnalyzeResult
>({
	name: BACKLINK_ANALYZE_TOOL_NAME,
	title: '分析反向链接',
	description: BACKLINK_ANALYZE_DESCRIPTION,
	inputSchema: backlinkAnalyzeSchema,
	outputSchema: backlinkAnalyzeResultSchema,
	annotations: backlinkAnalyzeAnnotations,
	surface: {
		family: 'builtin.graph.backlink',
		visibility: 'candidate-only',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '分析指定笔记的一跳入链、出链与双向链接。',
		whenToUse: [
			'需要理解某篇笔记与周边笔记的关系',
			'需要找出引用来源或双向链接',
		],
		whenNotToUse: [
			'正文搜索请改用 search_content',
			'修改属性或正文时不要使用当前工具',
		],
		capabilityTags: [
			'backlink',
			'graph',
			'links',
			'incoming',
			'outgoing',
			'图谱',
			'反向链接',
			'双向链接',
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
	validateInput: validateBacklinkAnalyzeInput,
	getToolUseSummary: summarizeBacklinkAnalyze,
	getActivityDescription: describeBacklinkAnalyzeActivity,
	execute: async (args) => executeBacklinkAnalyze(app, args),
});
