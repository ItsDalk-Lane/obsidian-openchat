import type {
	BuiltinToolExecutionContext,
	BuiltinValidationResult,
} from '../../runtime/types';
import {
	resolveFetchToolRuntime,
	type BatchFetchResult,
	type FetchToolsOptions,
} from '../fetch-tool-support';
import type { FetchArgs } from './schema';

interface SingleFetchArgs {
	readonly url: string;
	readonly max_length: number;
	readonly start_index: number;
	readonly raw: boolean;
}

interface BatchFetchArgs {
	readonly urls: string[];
	readonly max_length: number;
	readonly start_index: number;
	readonly raw: boolean;
}

const LONG_FETCH_NOTICE = '<notice>内容已截断。使用 start_index=';

const normalizeUrl = (url?: string | null): string | null => {
	const trimmed = url?.trim();
	return trimmed ? trimmed : null;
};

const summarizeUrlList = (urls?: readonly string[]): string | null => {
	if (!urls || urls.length === 0) {
		return null;
	}
	if (urls.length === 1) {
		return urls[0] ?? null;
	}
	const [firstUrl] = urls;
	return firstUrl
		? `${firstUrl} 等 ${urls.length} 个网页`
		: `${urls.length} 个网页`;
};

export const summarizeFetchTarget = (
	args: Partial<Pick<FetchArgs, 'url' | 'urls'>>,
): string | null => {
	return summarizeUrlList(args.urls) ?? normalizeUrl(args.url);
};

export const describeFetchActivity = (
	args: Partial<Pick<FetchArgs, 'url' | 'urls'>>,
): string | null => {
	if (args.urls && args.urls.length > 0) {
		return `批量抓取 ${args.urls.length} 个网页`;
	}
	const url = normalizeUrl(args.url);
	return url ? `抓取网页 ${url}` : null;
};

export const validateFetchInput = (
	args: FetchArgs,
): BuiltinValidationResult => {
	if (args.urls && args.urls.length > 0) {
		return { ok: true };
	}
	if (normalizeUrl(args.url)) {
		return { ok: true };
	}
	return {
		ok: false,
		summary: 'fetch 至少需要提供 url 或 urls 其中之一。',
		notes: [
			'抓取单个网页时传 url。',
			'批量抓取多个网页时传 urls。',
		],
	};
};

export const executeFetchSingleTarget = async (
	args: SingleFetchArgs,
	context: BuiltinToolExecutionContext<unknown>,
	options: FetchToolsOptions = {},
): Promise<string> => {
	const runtime = resolveFetchToolRuntime(options);
	context.reportProgress?.({
		message: `正在抓取网页 ${args.url}`,
		progress: {
			mode: 'single',
			url: args.url,
			start_index: args.start_index,
			max_length: args.max_length,
		},
	});

	const result = await runtime.fetchSingleUrl(
		args.url,
		runtime.userAgent,
		runtime.ignoreRobotsTxt,
		runtime.blacklistSet,
		args.raw,
		args.max_length,
		args.start_index,
	);

	if (result.includes(LONG_FETCH_NOTICE)) {
		context.reportProgress?.({
			message: '网页内容较长，可继续分页读取剩余内容。',
			progress: {
				mode: 'single',
				url: args.url,
				truncated: true,
			},
		});
	}

	return result;
};

const countBatchFailures = (
	results: readonly BatchFetchResult[],
): number => {
	return results.filter((result) => !result.success).length;
};

export const executeFetchBatchTargets = async (
	args: BatchFetchArgs,
	context: BuiltinToolExecutionContext<unknown>,
	options: FetchToolsOptions = {},
): Promise<string> => {
	const runtime = resolveFetchToolRuntime(options);
	context.reportProgress?.({
		message: `开始批量抓取 ${args.urls.length} 个网页`,
		progress: {
			mode: 'batch',
			total: args.urls.length,
			completed: 0,
		},
	});

	const results = await runtime.fetchBatch(
		args.urls,
		runtime.userAgent,
		runtime.ignoreRobotsTxt,
		runtime.blacklistSet,
		args.raw,
		args.max_length,
		args.start_index,
	);

	const failureCount = countBatchFailures(results);
	context.reportProgress?.({
		message: failureCount > 0
			? `批量抓取完成：成功 ${results.length - failureCount} 个，失败 ${failureCount} 个`
			: `批量抓取完成：共 ${results.length} 个网页`,
		progress: {
			mode: 'batch',
			total: results.length,
			completed: results.length,
			failed: failureCount,
		},
	});

	return JSON.stringify(results, null, 2);
};

export const executeFetch = async (
	args: FetchArgs,
	context: BuiltinToolExecutionContext<unknown>,
	options: FetchToolsOptions = {},
): Promise<string> => {
	if (args.urls && args.urls.length > 0) {
		return await executeFetchBatchTargets({
			urls: args.urls,
			max_length: args.max_length,
			start_index: args.start_index,
			raw: args.raw,
		}, context, options);
	}

	const url = normalizeUrl(args.url);
	if (!url) {
		throw new Error('fetch 至少需要提供 url 或 urls 其中之一');
	}

	return await executeFetchSingleTarget({
		...args,
		url,
	}, context, options);
};
