import { z } from 'zod';
import type { BuiltinTool } from '../runtime/types';
import {
	createFetchCommonFields,
	createFetchUrlField,
	createFetchUrlsField,
	resolveFetchToolRuntime,
	type FetchToolsOptions,
} from './fetch-tool-support';

const fetchWebpageSchema = z.object({
	url: createFetchUrlField(),
	...createFetchCommonFields(),
}).strict();

const fetchWebpagesBatchSchema = z.object({
	urls: createFetchUrlsField(),
	...createFetchCommonFields(),
}).strict();

type FetchWebpageArgs = z.infer<typeof fetchWebpageSchema>;
type FetchWebpagesBatchArgs = z.infer<typeof fetchWebpagesBatchSchema>;

export function createFetchWrapperTools(
	options: FetchToolsOptions = {},
): BuiltinTool[] {
	const runtime = resolveFetchToolRuntime(options);

	return [
		{
			name: 'fetch_webpage',
			title: '抓取单个网页',
			description: '抓取单个已知网页并返回正文内容。',
			inputSchema: fetchWebpageSchema,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
			async execute(args: FetchWebpageArgs) {
				return await runtime.fetchSingleUrl(
					args.url,
					runtime.userAgent,
					runtime.ignoreRobotsTxt,
					runtime.blacklistSet,
					args.raw,
					args.max_length,
					args.start_index,
				);
			},
		},
		{
			name: 'fetch_webpages_batch',
			title: '批量抓取网页',
			description: '批量抓取多个已知网页并返回结果数组。',
			inputSchema: fetchWebpagesBatchSchema,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
			async execute(args: FetchWebpagesBatchArgs) {
				const results = await runtime.fetchBatch(
					args.urls,
					runtime.userAgent,
					runtime.ignoreRobotsTxt,
					runtime.blacklistSet,
					args.raw,
					args.max_length,
					args.start_index,
				);
				return JSON.stringify(results, null, 2);
			},
		},
	];
}