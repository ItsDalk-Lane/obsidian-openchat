import { buildBuiltinTool } from '../../runtime/build-tool';
import type { BuiltinTool } from '../../runtime/types';
import { BING_SEARCH_DESCRIPTION } from './description';
import {
	describeBingSearchActivity,
	executeBingSearch,
	summarizeBingSearchTarget,
	validateBingSearchInput,
} from './service';
import {
	bingSearchAnnotations,
	bingSearchSchema,
	type BingSearchArgs,
} from './schema';

export const BING_SEARCH_TOOL_NAME = 'bing_search';

export function createBingSearchTools(): BuiltinTool[] {
	return [buildBuiltinTool<BingSearchArgs, string>({
		name: BING_SEARCH_TOOL_NAME,
		title: '必应中文搜索',
		description: BING_SEARCH_DESCRIPTION,
		inputSchema: bingSearchSchema,
		annotations: bingSearchAnnotations,
		surface: {
			family: 'builtin.web.search',
			visibility: 'default',
			argumentComplexity: 'medium',
			riskLevel: 'read-only',
			oneLinePurpose: '搜索网络内容。',
			whenNotToUse: [
				'已知具体网页 URL 且只想读取正文时改用 fetch_webpage',
				'搜索 Vault 本地内容时改用 search_content 或 find_paths',
			],
			capabilityTags: [
				'web search',
				'search web',
				'internet',
				'搜索网络',
				'联网搜索',
			],
			requiredArgsSummary: ['query'],
		},
		isReadOnly: () => true,
		validateInput: (args) => validateBingSearchInput(args),
		getToolUseSummary: summarizeBingSearchTarget,
		getActivityDescription: describeBingSearchActivity,
		execute: async (args) => await executeBingSearch(args),
	})];
}
