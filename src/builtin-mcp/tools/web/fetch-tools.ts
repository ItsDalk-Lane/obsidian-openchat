import { htmlToMarkdown, requestUrl } from 'obsidian';
import { Readability } from '@mozilla/readability';
import { z } from 'zod';
import {
	DEFAULT_FETCH_MAX_LENGTH,
	DEFAULT_FETCH_USER_AGENT,
	DEFAULT_FETCH_MAX_CONTENT_LENGTH,
} from '../../constants';
import type { BuiltinTool } from '../../runtime/types';
import {
	DEFAULT_CRAWLER_BLACKLIST,
	buildBlacklistSet,
	checkUrlBlacklist,
} from './crawler-blacklist';

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
 * 验证 URL 格式，仅允许 http/https 协议
 */
function validateUrl(url: string): string {
	const trimmed = url.trim();
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error(`URL 格式无效: ${trimmed}`);
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error(`不支持的协议: ${parsed.protocol}，仅支持 http 和 https`);
	}

	// 安全检查：拒绝指向私有 IP 的 URL
	const hostname = parsed.hostname;
	if (isPrivateHostname(hostname)) {
		throw new Error(`安全限制：不允许访问私有网络地址: ${hostname}`);
	}

	return trimmed;
}

/**
 * 检查主机名是否为私有/内部地址
 */
function isPrivateHostname(hostname: string): boolean {
	// 检查常见私有 IP 范围
	if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
		return true;
	}

	// 检查 IPv4 私有地址段
	const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (ipv4Match) {
		const [, a, b] = ipv4Match.map(Number);
		// 10.0.0.0/8
		if (a === 10) return true;
		// 172.16.0.0/12
		if (a === 172 && b >= 16 && b <= 31) return true;
		// 192.168.0.0/16
		if (a === 192 && b === 168) return true;
		// 169.254.0.0/16 (link-local)
		if (a === 169 && b === 254) return true;
	}

	return false;
}

/**
 * 构建 robots.txt 的 URL
 */
function getRobotsTxtUrl(url: string): string {
	const parsed = new URL(url);
	return `${parsed.protocol}//${parsed.host}/robots.txt`;
}

/**
 * 解析 robots.txt，检查是否允许指定 User-Agent 访问目标 URL
 */
function parseRobotsTxt(robotsTxt: string, url: string, userAgent: string): boolean {
	const lines = robotsTxt.split('\n').map((line) => {
		// 移除注释
		const commentIndex = line.indexOf('#');
		return (commentIndex >= 0 ? line.slice(0, commentIndex) : line).trim();
	});

	const parsedUrl = new URL(url);
	const path = parsedUrl.pathname + parsedUrl.search;
	const normalizedAgent = userAgent.toLowerCase();

	const currentAgents: string[] = [];
	let isMatchingAgent = false;
	let isWildcardAgent = false;
	let specificResult: boolean | null = null;
	let wildcardResult: boolean | null = null;

	for (const line of lines) {
		if (!line) continue;

		const colonIndex = line.indexOf(':');
		if (colonIndex < 0) continue;

		const directive = line.slice(0, colonIndex).trim().toLowerCase();
		const value = line.slice(colonIndex + 1).trim();

		if (directive === 'user-agent') {
			if (currentAgents.length > 0 && (isMatchingAgent || isWildcardAgent)) {
				// 已处理完当前 agent 块，如果找到特定匹配则停止
				if (specificResult !== null) break;
			}
			if (currentAgents.length === 0 || directive === 'user-agent') {
				currentAgents.push(value.toLowerCase());
				isMatchingAgent = currentAgents.some(
					(agent) => normalizedAgent.includes(agent) && agent !== '*'
				);
				isWildcardAgent = currentAgents.includes('*');
			}
		} else if (directive === 'disallow' || directive === 'allow') {
			if (!value && directive === 'disallow') continue; // 空 Disallow 意味着允许所有
			if (!isMatchingAgent && !isWildcardAgent) continue;

			const matches = matchRobotsPath(path, value);
			if (matches) {
				const allowed = directive === 'allow';
				if (isMatchingAgent) {
					specificResult = allowed;
				} else if (isWildcardAgent && wildcardResult === null) {
					wildcardResult = allowed;
				}
			}
		} else if (directive !== 'user-agent') {
			// 遇到非 User-agent 行后，重置 agent 列表以准备下一个块
			// 但只有遇到新的 User-agent 行时才重置
		}
	}

	// 优先使用特定 agent 匹配结果，其次使用通配符结果
	if (specificResult !== null) return specificResult;
	if (wildcardResult !== null) return wildcardResult;

	// 默认允许访问
	return true;
}

/**
 * 匹配 robots.txt 路径规则
 */
function matchRobotsPath(urlPath: string, pattern: string): boolean {
	if (!pattern) return false;

	// 将 robots.txt 通配符模式转换为正则
	let regexStr = '';
	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i];
		if (char === '*') {
			regexStr += '.*';
		} else if (char === '$' && i === pattern.length - 1) {
			regexStr += '$';
		} else {
			regexStr += char.replace(/[.*+?^{}()|[\]\\]/g, '\\$&');
		}
	}

	try {
		return new RegExp(`^${regexStr}`).test(urlPath);
	} catch {
		return urlPath.startsWith(pattern);
	}
}

/**
 * 检查 robots.txt 是否允许访问
 */
async function checkRobotsTxt(url: string, userAgent: string): Promise<void> {
	const robotsTxtUrl = getRobotsTxtUrl(url);

	try {
		const response = await requestUrl({
			url: robotsTxtUrl,
			method: 'GET',
			headers: { 'User-Agent': userAgent },
		});

		// 401/403 表示禁止自动访问
		if (response.status === 401 || response.status === 403) {
			throw new Error(
				`获取 robots.txt (${robotsTxtUrl}) 时收到状态码 ${response.status}，` +
				`推断该站点不允许自动化工具访问。用户可尝试设置 raw 参数手动获取。`
			);
		}

		// 4xx 其他错误视为无限制
		if (response.status >= 400 && response.status < 500) {
			return;
		}

		const robotsTxt = response.text;
		const allowed = parseRobotsTxt(robotsTxt, url, userAgent);

		if (!allowed) {
			throw new Error(
				`目标网站的 robots.txt (${robotsTxtUrl}) 禁止当前 User-Agent 访问该页面。\n` +
				`User-Agent: ${userAgent}\n` +
				`URL: ${url}\n` +
				`如需强制获取，请在设置中禁用 robots.txt 检查。`
			);
		}
	} catch (error) {
		if (error instanceof Error && error.message.includes('robots.txt')) {
			throw error;
		}
		// robots.txt 获取失败（网络问题），记录警告但继续执行
		// 因为无法确定限制规则，默认允许访问
	}
}

/**
 * 判断内容是否为 HTML
 */
function isHtmlContent(contentType: string, rawContent: string): boolean {
	if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
		return true;
	}
	// Content-Type 未指定时，检测内容特征
	if (!contentType || contentType.includes('text/plain')) {
		const trimmed = rawContent.trimStart().slice(0, 200).toLowerCase();
		return trimmed.includes('<html') || trimmed.includes('<!doctype html');
	}
	return false;
}

/**
 * 使用 Readability 提取 HTML 正文内容
 */
function extractHtmlContent(html: string, url: string): string {
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');

		// 设置文档 URL，使 Readability 能正确处理相对链接
		const baseEl = doc.createElement('base');
		baseEl.setAttribute('href', url);
		doc.head.appendChild(baseEl);

		const reader = new Readability(doc);
		const article = reader.parse();

		if (!article || !article.content) {
			return '';
		}

		return article.content;
	} catch {
		return '';
	}
}

/**
 * 将 HTML 内容转换为 Markdown
 */
function convertHtmlToMarkdown(html: string): string {
	try {
		return htmlToMarkdown(html);
	} catch {
		// 回退：简单移除 HTML 标签
		return html
			.replace(/<[^>]+>/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	}
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
