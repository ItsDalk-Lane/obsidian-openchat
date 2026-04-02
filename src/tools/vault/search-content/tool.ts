import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { SEARCH_CONTENT_DESCRIPTION } from './description';
import {
	executeSearchContent,
	validateSearchContentInput,
} from './service';
import {
	searchContentAnnotations,
	searchContentOutputSchema,
	searchContentSchema,
	type SearchContentArgs,
} from './schema';

export const SEARCH_CONTENT_TOOL_NAME = 'search_content';

const summarizeSearchContentTarget = (
	args: Partial<SearchContentArgs>,
): string | null => {
	if (!args.pattern) {
		return null;
	}
	const scopePath = args.scope_path ?? '/';
	return scopePath === '/' ? args.pattern : `${args.pattern} @ ${scopePath}`;
};

export const createSearchContentTool = (app: App) => buildBuiltinTool<SearchContentArgs>({
	name: SEARCH_CONTENT_TOOL_NAME,
	title: '搜索文件内容',
	description: SEARCH_CONTENT_DESCRIPTION,
	inputSchema: searchContentSchema,
	outputSchema: searchContentOutputSchema,
	annotations: searchContentAnnotations,
	surface: {
		family: 'builtin.vault.search',
		visibility: 'default',
		argumentComplexity: 'high',
		riskLevel: 'read-only',
		oneLinePurpose: '在文件正文中搜索文本或正则。',
		whenToUse: ['已经明确要在文件正文里搜索关键词、短语或模式'],
		whenNotToUse: [
			'按文件名或路径定位目标时改用 find_paths',
			'已知单个文件路径时改用 read_file',
		],
		capabilityTags: ['search', 'content', 'regex', 'grep', '正文搜索', '内容搜索'],
		requiredArgsSummary: ['pattern'],
	},
	runtimePolicy: {
		defaultArgs: {
			response_format: 'json',
		},
		hiddenSchemaFields: ['response_format'],
	},
	isReadOnly: () => true,
	isConcurrencySafe: () => true,
	validateInput: (args) => validateSearchContentInput(app, args),
	getToolUseSummary: summarizeSearchContentTarget,
	getActivityDescription: (args) =>
		args.pattern ? `搜索内容 ${summarizeSearchContentTarget(args)}` : null,
	execute: async (args) => await executeSearchContent(app, args),
});