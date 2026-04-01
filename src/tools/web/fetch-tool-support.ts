import { z } from 'zod';
import {
	DEFAULT_FETCH_MAX_CONTENT_LENGTH,
	DEFAULT_FETCH_MAX_LENGTH,
	DEFAULT_FETCH_USER_AGENT,
} from '../runtime/constants';
import {
	DEFAULT_CRAWLER_BLACKLIST,
	buildBlacklistSet,
	checkUrlBlacklist,
} from './crawler-blacklist';
import {
	checkRobotsTxt,
	convertHtmlToMarkdown,
	extractHtmlContent,
	isHtmlContent,
	validateUrl,
} from './fetchUtils';

const DEFAULT_BATCH_CONCURRENCY = 5;

export const createFetchUrlField = () => z
	.string()
	.min(1)
	.describe('目标网址，必须是 http 或 https 协议');

export const createFetchUrlsField = () => z
	.array(z.string().min(1))
	.min(1)
	.describe('目标网址数组，适用于批量抓取');

export const createFetchCommonFields = () => ({
	max_length: z
		.number()
		.int()
		.min(1)
		.max(1_000_000)
		.default(DEFAULT_FETCH_MAX_LENGTH)
		.describe('单次请求最多返回多少字符，用于限制响应大小；默认 5000。'),
	start_index: z
		.number()
		.int()
		.min(0)
		.default(0)
		.describe('从内容的第几个字符开始返回，用于分页获取长网页内容；默认从 0 开始。'),
	raw: z
		.boolean()
		.default(false)
		.describe('是否跳过 HTML 正文提取和 Markdown 转换，直接返回原始内容；默认 false。'),
});

export interface BatchFetchResult {
	url: string;
	success: boolean;
	content?: string;
	error?: string;
}

export type FetchSingleUrlHandler = (
	url: string,
	userAgent: string,
	ignoreRobotsTxt: boolean,
	blacklistSet: Set<string>,
	raw: boolean,
	maxLength: number,
	startIndex: number,
) => Promise<string>;

export type FetchBatchHandler = (
	urls: string[],
	userAgent: string,
	ignoreRobotsTxt: boolean,
	blacklistSet: Set<string>,
	raw: boolean,
	maxLength: number,
	startIndex: number,
) => Promise<BatchFetchResult[]>;

export interface FetchExecutionRuntimeOverrides {
	fetchSingleUrl?: FetchSingleUrlHandler;
	fetchBatch?: FetchBatchHandler;
}

export interface FetchToolsOptions {
	userAgent?: string;
	ignoreRobotsTxt?: boolean;
	crawlerBlacklist?: readonly string[];
	runtime?: FetchExecutionRuntimeOverrides;
}

interface ResolvedFetchToolRuntime {
	userAgent: string;
	ignoreRobotsTxt: boolean;
	blacklistSet: Set<string>;
	fetchSingleUrl: FetchSingleUrlHandler;
	fetchBatch: FetchBatchHandler;
}

async function fetchUrl(
	url: string,
	userAgent: string,
	forceRaw: boolean,
): Promise<{ content: string; prefix: string; statusCode: number; contentType: string }> {
	const { requestUrl } = await import('obsidian');
	let response;
	try {
		response = await requestUrl({
			url,
			method: 'GET',
			headers: { 'User-Agent': userAgent },
			throw: false,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`网络请求失败: ${url}\n原因: ${message}`);
	}

	if (response.status >= 400) {
		throw new Error(`HTTP 请求失败: ${url}\n状态码: ${response.status}`);
	}

	const contentType = response.headers?.['content-type'] ?? '';
	const rawContent = response.text;

	if (rawContent.length > DEFAULT_FETCH_MAX_CONTENT_LENGTH) {
		throw new Error(
			`内容过大 (${rawContent.length} 字符，限制 ${DEFAULT_FETCH_MAX_CONTENT_LENGTH} 字符)。`
			+ '请尝试使用 start_index 和 max_length 参数分页获取。',
		);
	}

	const isHtml = isHtmlContent(contentType, rawContent);
	if (isHtml && !forceRaw) {
		const extractedHtml = extractHtmlContent(rawContent, url);
		if (!extractedHtml) {
			return {
				content: '',
				prefix: '<notice>页面正文提取失败，可能是因为页面主要由脚本或非文本内容组成。建议使用 raw=true 参数获取原始内容。</notice>\n',
				statusCode: response.status,
				contentType,
			};
		}

		return {
			content: await convertHtmlToMarkdown(extractedHtml),
			prefix: '',
			statusCode: response.status,
			contentType,
		};
	}

	const prefix = isHtml
		? ''
		: contentType
			? `Content type ${contentType} 无法简化为 Markdown，以下是原始内容:\n`
			: '';

	return {
		content: rawContent,
		prefix,
		statusCode: response.status,
		contentType,
	};
}

export const fetchSingleUrl: FetchSingleUrlHandler = async (
	url,
	userAgent,
	ignoreRobotsTxt,
	blacklistSet,
	raw,
	maxLength,
	startIndex,
) => {
	const validatedUrl = validateUrl(url);
	const blockedDomain = checkUrlBlacklist(validatedUrl, blacklistSet);
	if (blockedDomain) {
		throw new Error(
			`该网站（${blockedDomain}）在爬虫黑名单中，因平台限制无法抓取。`
			+ '如需解除拦截，请在设置中编辑爬虫黑名单。',
		);
	}

	if (!ignoreRobotsTxt) {
		await checkRobotsTxt(validatedUrl, userAgent);
	}

	const { content, prefix } = await fetchUrl(validatedUrl, userAgent, raw);
	const originalLength = content.length;
	if (startIndex >= originalLength && originalLength > 0) {
		return `<notice>没有更多内容。内容总长度为 ${originalLength} 字符。</notice>`;
	}

	let resultContent: string;
	if (originalLength === 0) {
		resultContent = prefix || '<notice>页面内容为空。</notice>';
	} else {
		const sliced = content.slice(startIndex, startIndex + maxLength);
		if (!sliced) {
			resultContent = '<notice>没有更多内容。</notice>';
		} else {
			resultContent = sliced;
			const actualLength = sliced.length;
			const remaining = originalLength - (startIndex + actualLength);
			if (actualLength === maxLength && remaining > 0) {
				const nextStart = startIndex + actualLength;
				resultContent += [
					'',
					'',
					`<notice>内容已截断。使用 start_index=${nextStart}`,
					`调用 fetch 工具获取更多内容（剩余约 ${remaining} 字符）。</notice>`,
				].join('\n');
			}
		}
	}

	return `${prefix}Contents of ${validatedUrl}:\n${resultContent}`;
};

export const fetchBatch: FetchBatchHandler = async (
	urls,
	userAgent,
	ignoreRobotsTxt,
	blacklistSet,
	raw,
	maxLength,
	startIndex,
) => {
	const results: BatchFetchResult[] = new Array(urls.length);
	for (let index = 0; index < urls.length; index += DEFAULT_BATCH_CONCURRENCY) {
		const batch = urls.slice(index, index + DEFAULT_BATCH_CONCURRENCY);
		const batchResults = await Promise.allSettled(
			batch.map((url) =>
				fetchSingleUrl(url, userAgent, ignoreRobotsTxt, blacklistSet, raw, maxLength, startIndex),
			),
		);

		for (let batchIndex = 0; batchIndex < batchResults.length; batchIndex += 1) {
			const result = batchResults[batchIndex];
			const url = batch[batchIndex];
			results[index + batchIndex] = result.status === 'fulfilled'
				? { url, success: true, content: result.value }
				: {
					url,
					success: false,
					error: result.reason instanceof Error
						? result.reason.message
						: String(result.reason),
				};
		}
	}

	return results;
};

export const resolveFetchToolRuntime = (
	options: FetchToolsOptions = {},
): ResolvedFetchToolRuntime => {
	const {
		userAgent = DEFAULT_FETCH_USER_AGENT,
		ignoreRobotsTxt = false,
		crawlerBlacklist = DEFAULT_CRAWLER_BLACKLIST,
		runtime,
	} = options;

	return {
		userAgent,
		ignoreRobotsTxt,
		blacklistSet: buildBlacklistSet(crawlerBlacklist),
		fetchSingleUrl: runtime?.fetchSingleUrl ?? fetchSingleUrl,
		fetchBatch: runtime?.fetchBatch ?? fetchBatch,
	};
};