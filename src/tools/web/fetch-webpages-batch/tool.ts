import { buildBuiltinTool } from '../../runtime/build-tool';
import type { BuiltinTool } from '../../runtime/types';
import { FETCH_WEBPAGES_BATCH_DESCRIPTION } from './description';
import {
	describeFetchWebpagesBatchActivity,
	executeFetchWebpagesBatch,
	summarizeFetchWebpagesBatchTarget,
} from './service';
import {
	fetchWebpagesBatchSchema,
	type FetchToolsOptions,
	type FetchWebpagesBatchArgs,
} from './schema';

export const FETCH_WEBPAGES_BATCH_TOOL_NAME = 'fetch_webpages_batch';

export const createFetchWebpagesBatchTool = (
	options: FetchToolsOptions = {},
): BuiltinTool<FetchWebpagesBatchArgs, string, Record<string, unknown>> => buildBuiltinTool<
	FetchWebpagesBatchArgs,
	string,
	Record<string, unknown>
>({
	name: FETCH_WEBPAGES_BATCH_TOOL_NAME,
	title: '批量抓取网页',
	description: FETCH_WEBPAGES_BATCH_DESCRIPTION,
	inputSchema: fetchWebpagesBatchSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: true,
	},
	surface: {
		family: 'builtin.web.fetch',
		visibility: 'candidate-only',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '批量抓取多个已知网页。',
		whenNotToUse: [
			'只抓取单个网页时改用 fetch_webpage',
			'需要先搜索候选网页时先用 bing_search',
		],
		capabilityTags: [
			'batch fetch',
			'multiple urls',
			'batch',
			'批量抓取',
			'多个网页',
		],
		requiredArgsSummary: ['urls'],
	},
	isReadOnly: () => true,
	getToolUseSummary: summarizeFetchWebpagesBatchTarget,
	getActivityDescription: describeFetchWebpagesBatchActivity,
	execute: async (args, context) =>
		await executeFetchWebpagesBatch(args, context, options),
});
