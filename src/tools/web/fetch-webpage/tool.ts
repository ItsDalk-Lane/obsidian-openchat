import { buildBuiltinTool } from '../../runtime/build-tool';
import type { BuiltinTool } from '../../runtime/types';
import { FETCH_WEBPAGE_DESCRIPTION } from './description';
import {
	describeFetchWebpageActivity,
	executeFetchWebpage,
	summarizeFetchWebpageTarget,
} from './service';
import {
	fetchWebpageSchema,
	type FetchToolsOptions,
	type FetchWebpageArgs,
} from './schema';

export const FETCH_WEBPAGE_TOOL_NAME = 'fetch_webpage';

export const createFetchWebpageTool = (
	options: FetchToolsOptions = {},
): BuiltinTool<FetchWebpageArgs, string, Record<string, unknown>> => buildBuiltinTool<
	FetchWebpageArgs,
	string,
	Record<string, unknown>
>({
	name: FETCH_WEBPAGE_TOOL_NAME,
	title: '抓取单个网页',
	description: FETCH_WEBPAGE_DESCRIPTION,
	inputSchema: fetchWebpageSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: true,
	},
	surface: {
		family: 'builtin.web.fetch',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '抓取单个已知网页。',
		whenNotToUse: [
			'需要先搜索候选网页时先用 bing_search',
			'需要批量抓取多个网页时改用 fetch_webpages_batch',
			'读取 Vault 本地文件时改用 read_file',
		],
		capabilityTags: [
			'fetch',
			'webpage',
			'url',
			'http',
			'抓取网页',
			'网页正文',
		],
		requiredArgsSummary: ['url'],
	},
	isReadOnly: () => true,
	getToolUseSummary: summarizeFetchWebpageTarget,
	getActivityDescription: describeFetchWebpageActivity,
	execute: async (args, context) => await executeFetchWebpage(args, context, options),
});
