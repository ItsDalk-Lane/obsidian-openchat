import { buildBuiltinTool } from '../../runtime/build-tool';
import type { BuiltinTool } from '../../runtime/types';
import { FETCH_DESCRIPTION } from './description';
import {
	describeFetchActivity,
	executeFetch,
	summarizeFetchTarget,
	validateFetchInput,
} from './service';
import {
	fetchSchema,
	type FetchArgs,
	type FetchToolsOptions,
} from './schema';

export const FETCH_TOOL_NAME = 'fetch';

export const createFetchTool = (
	options: FetchToolsOptions = {},
): BuiltinTool<FetchArgs, string, Record<string, unknown>> => buildBuiltinTool<
	FetchArgs,
	string,
	Record<string, unknown>
>({
	name: FETCH_TOOL_NAME,
	title: '获取网页内容',
	description: FETCH_DESCRIPTION,
	inputSchema: fetchSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: true,
	},
	surface: {
		family: 'builtin.web.fetch',
		visibility: 'default',
		argumentComplexity: 'high',
		riskLevel: 'read-only',
		oneLinePurpose:
			'兼容型网页抓取工具；默认优先使用 fetch_webpage 或 fetch_webpages_batch。',
		whenNotToUse: [
			'抓取单个已知 URL 时改用 fetch_webpage',
			'抓取多个已知 URL 时改用 fetch_webpages_batch',
			'需要先搜索候选网页时改用 bing_search',
		],
		capabilityTags: [
			'fetch',
			'url',
			'website',
			'webpage',
			'抓取网页',
			'网页内容',
		],
		requiredArgsSummary: ['url 或 urls'],
		compatibility: {
			deprecationStatus: 'legacy',
		},
	},
	isReadOnly: () => true,
	validateInput: (args) => validateFetchInput(args),
	getToolUseSummary: summarizeFetchTarget,
	getActivityDescription: describeFetchActivity,
	execute: async (args, context) => await executeFetch(args, context, options),
});

export function createFetchTools(
	options: FetchToolsOptions = {},
): BuiltinTool[] {
	return [createFetchTool(options)];
}
