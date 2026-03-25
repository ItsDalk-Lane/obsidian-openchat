import { requestUrl } from 'obsidian';
import { z } from 'zod';
import {
	DEFAULT_FETCH_MAX_LENGTH,
	DEFAULT_FETCH_USER_AGENT,
	DEFAULT_FETCH_MAX_CONTENT_LENGTH,
} from '../runtime/constants';
import type { BuiltinTool } from '../runtime/types';
import {
	DEFAULT_CRAWLER_BLACKLIST,
	buildBlacklistSet,
	checkUrlBlacklist,
} from './crawler-blacklist';
import {
	validateUrl,
	checkRobotsTxt,
	isHtmlContent,
	extractHtmlContent,
	convertHtmlToMarkdown,
} from './fetchUtils';

/** 批量抓取默认并发数 */
const DEFAULT_BATCH_CONCURRENCY = 5;

/** fetch 工具的输入参数 Schema */
const fetchSchema = z
	.object({
		url: z
			.string()
			.min(1)
			.describe('单个抓取模式使用的目标网址，必须是 http 或 https 协议。当同时提供 urls 时，该字段会被忽略。'),
		urls: z
			.array(z.string().min(1))
			.min(1)
			.optional()
			.describe('批量抓取模式使用的网址数组。提供此参数时进入批量模式，url 字段会被忽略。'),
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
	})
	.strict();

type FetchArgs = z.infer<typeof fetchSchema>;

export interface FetchToolsOptions {
	/** 自定义 User-Agent 字符串 */
	userAgent?: string;
	/** 是否跳过 robots.txt 检查 */
	ignoreRobotsTxt?: boolean;
	/** 自定义爬虫黑名单域名列表（替换默认列表） */
	crawlerBlacklist?: readonly string[];
}

/**
 * 获取 URL 内容并处理
 */
async function fetchUrl(
	url: string,
	userAgent: string,
	forceRaw: boolean
): Promise<{ content: string; prefix: string; statusCode: number; contentType: string }> {
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
		throw new Error(
			`HTTP 请求失败: ${url}\n状态码: ${response.status}`
		);
	}

	const contentType = response.headers?.['content-type'] ?? '';
	const rawContent = response.text;

	// 超大内容检测
	if (rawContent.length > DEFAULT_FETCH_MAX_CONTENT_LENGTH) {
		throw new Error(
			`内容过大 (${rawContent.length} 字符，限制 ${DEFAULT_FETCH_MAX_CONTENT_LENGTH} 字符)。` +
			`请尝试使用 start_index 和 max_length 参数分页获取。`
		);
	}

	const isHtml = isHtmlContent(contentType, rawContent);

	if (isHtml && !forceRaw) {
		const extractedHtml = extractHtmlContent(rawContent, url);
		if (!extractedHtml) {
			return {
				content: '',
				prefix: `<notice>页面正文提取失败，可能是因为页面主要由脚本或非文本内容组成。建议使用 raw=true 参数获取原始内容。</notice>\n`,
				statusCode: response.status,
				contentType,
			};
		}
		const markdown = convertHtmlToMarkdown(extractedHtml);
		return {
			content: markdown,
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

/**
 * 注册 fetch 内置 MCP 工具
 */
/**
 * 执行单个 URL 的完整抓取流程（黑名单检查 → robots.txt 检查 → 内容获取）
 * @returns 格式化后的文本结果
 */
async function fetchSingleUrl(
	url: string,
	userAgent: string,
	ignoreRobotsTxt: boolean,
	blacklistSet: Set<string>,
	raw: boolean,
	maxLength: number,
	startIndex: number,
): Promise<string> {
	const validatedUrl = validateUrl(url);

	// 1. 爬虫黑名单检查（优先于 robots.txt）
	const blockedDomain = checkUrlBlacklist(validatedUrl, blacklistSet);
	if (blockedDomain) {
		throw new Error(
			`该网站（${blockedDomain}）在爬虫黑名单中，因平台限制无法抓取。` +
			`如需解除拦截，请在设置中编辑爬虫黑名单。`
		);
	}

	// 2. robots.txt 合规性检查
	if (!ignoreRobotsTxt) {
		await checkRobotsTxt(validatedUrl, userAgent);
	}

	// 3. 获取并处理内容
	const { content, prefix } = await fetchUrl(validatedUrl, userAgent, raw);

	const originalLength = content.length;

	// 分页处理
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
				resultContent += `\n\n<notice>内容已截断。使用 start_index=${nextStart} 调用 fetch 工具获取更多内容（剩余约 ${remaining} 字符）。</notice>`;
			}
		}
	}

	return `${prefix}Contents of ${validatedUrl}:\n${resultContent}`;
}

/** 单个 URL 批量抓取结果 */
interface BatchFetchResult {
	url: string;
	success: boolean;
	content?: string;
	error?: string;
}

/**
 * 并发抓取多个 URL，控制并发度
 */
async function fetchBatch(
	urls: string[],
	userAgent: string,
	ignoreRobotsTxt: boolean,
	blacklistSet: Set<string>,
	raw: boolean,
	maxLength: number,
	startIndex: number,
): Promise<BatchFetchResult[]> {
	const results: BatchFetchResult[] = new Array(urls.length);

	// 分批并发执行
	for (let i = 0; i < urls.length; i += DEFAULT_BATCH_CONCURRENCY) {
		const batch = urls.slice(i, i + DEFAULT_BATCH_CONCURRENCY);
		const batchResults = await Promise.allSettled(
			batch.map((url) =>
				fetchSingleUrl(url, userAgent, ignoreRobotsTxt, blacklistSet, raw, maxLength, startIndex)
			)
		);

		for (let j = 0; j < batchResults.length; j++) {
			const result = batchResults[j];
			const url = batch[j];
			results[i + j] = result.status === 'fulfilled'
				? { url, success: true, content: result.value }
				: { url, success: false, error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
		}
	}

	return results;
}

/**
 * 创建 fetch 内置工具
 */
export function createFetchTools(
	options: FetchToolsOptions = {}
): BuiltinTool[] {
	const {
		userAgent = DEFAULT_FETCH_USER_AGENT,
		ignoreRobotsTxt = false,
		crawlerBlacklist = DEFAULT_CRAWLER_BLACKLIST,
	} = options;

	const blacklistSet = buildBlacklistSet(crawlerBlacklist);

	return [{
		name: 'fetch',
			title: '获取网页内容',
			description: `从互联网抓取网页内容，并可选地将 HTML 正文提取为 Markdown。支持单个 URL 和批量 URL 两种模式。

## 何时使用

- 需要访问网页内容或获取最新在线信息时
- 需要把网页正文提取成更适合模型消费的 Markdown 时
- 需要批量抓取多个已知 URL 时

## 何时不使用

- **不要用于读取 Vault 本地文件**：本地文件请使用 \`read_file\`
- **不要用于搜索未知网页**：需要先找网页时请使用 \`bing_search\`
- **不要把它当作浏览器自动化工具**：它只负责抓取和提取内容

## 可用字段

- **url**（单 URL 模式使用）：目标网址，必须是 \`http\` 或 \`https\`
- **urls**（批量模式使用）：多个目标网址组成的数组；提供后会忽略 \`url\`
- **max_length**（可选，默认 5000）：单次最多返回的字符数
- **start_index**（可选，默认 0）：从第几个字符开始返回，用于分页读取长内容
- **raw**（可选，默认 false）：是否跳过 HTML 提取和 Markdown 转换，直接返回原始内容

## 参数规则

- 提供 \`urls\` 时进入批量模式，\`url\` 字段会被忽略
- 单 URL 模式下应提供 \`url\`
- 当响应内容被截断时，使用返回提示中的下一段 \`start_index\` 继续读取

## 返回值

- 单 URL 模式返回处理后的网页内容文本，默认优先返回 Markdown 正文
- 批量模式返回 JSON 数组，每个元素包含 URL、是否成功、内容或错误信息

## 失败恢复

- 如果 URL 格式错误，先修正协议和地址
- 如果正文提取失败，尝试设置 \`raw=true\` 获取原始内容
- 如果内容过长，使用 \`start_index\` 和 \`max_length\` 分页抓取

## 示例

\`\`\`json
{
  "url": "https://example.com/article",
  "max_length": 4000,
  "start_index": 0,
  "raw": false
}
\`\`\``,
			inputSchema: fetchSchema,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		async execute(args: FetchArgs) {
			// 批量模式
			if (args.urls && args.urls.length > 0) {
				const results = await fetchBatch(
					args.urls,
					userAgent,
					ignoreRobotsTxt,
					blacklistSet,
					args.raw,
					args.max_length,
					args.start_index,
				);
				return JSON.stringify(results, null, 2);
			}

			// 单 URL 模式
			return await fetchSingleUrl(
				args.url,
				userAgent,
				ignoreRobotsTxt,
				blacklistSet,
				args.raw,
				args.max_length,
				args.start_index,
			);
		},
	}];
}
