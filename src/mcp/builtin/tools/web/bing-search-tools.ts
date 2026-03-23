/**
 * 必应中文搜索内置 MCP 工具
 * 直接使用必应网页搜索（无需 API 密钥），针对中文内容优化
 */

import { requestUrl } from 'obsidian';
import { z } from 'zod';
import type { BuiltinTool } from '../../runtime/types';

/** 必应中文搜索基础 URL */
const BING_SEARCH_URL = 'https://cn.bing.com/search';

/** 搜索请求 User-Agent，模拟 Chrome 浏览器 */
const BING_USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** 搜索结果项 */
interface BingSearchResultItem {
	id: string;
	title: string;
	url: string;
	snippet: string;
	displayUrl?: string;
}

/** 搜索响应 */
interface BingSearchResponse {
	query: string;
	results: BingSearchResultItem[];
	totalResults?: number;
}

/** bing_search 工具的输入参数 Schema */
const bingSearchSchema = z
	.object({
		query: z
			.string()
			.min(1)
			.describe('搜索关键词或查询语句'),
		count: z
			.number()
			.int()
			.min(1)
			.max(50)
			.default(10)
			.describe('返回的搜索结果数量，默认 10，范围 1-50'),
		offset: z
			.number()
			.int()
			.min(0)
			.default(0)
			.describe('结果偏移量，用于分页，默认 0'),
	})
	.strict();

type BingSearchArgs = z.infer<typeof bingSearchSchema>;

/**
 * 生成简短唯一标识符（基于时间戳 + 随机数）
 */
function generateId(): string {
	const ts = Date.now().toString(36);
	const rand = Math.random().toString(36).slice(2, 8);
	return `${ts}-${rand}`;
}

/**
 * 向必应中文搜索发起请求，返回 HTML 页面
 */
async function fetchBingSearchPage(
	query: string,
	offset: number
): Promise<string> {
	const params = new URLSearchParams({
		q: query,
		first: String(offset + 1), // 必应使用 first 参数表示起始位置（1-based）
	});

	const url = `${BING_SEARCH_URL}?${params.toString()}`;

	const response = await requestUrl({
		url,
		method: 'GET',
		headers: {
			'User-Agent': BING_USER_AGENT,
			'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
		},
		throw: false,
	});

	if (response.status >= 400) {
		throw new Error(
			`必应搜索请求失败（状态码: ${response.status}）。请检查网络连接或稍后重试。`
		);
	}

	return response.text;
}

/**
 * 解析必应搜索结果 HTML，提取搜索结果列表
 * 使用 DOMParser（Obsidian 运行环境内置）解析 HTML
 */
function parseBingSearchHtml(html: string, query: string): BingSearchResponse {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');
	const results: BingSearchResultItem[] = [];

	// 必应搜索结果容器：.b_algo
	const resultElements = doc.querySelectorAll('.b_algo');

	resultElements.forEach((element) => {
		try {
			// 标题和链接
			const titleLink = element.querySelector('h2 a');
			const title = titleLink?.textContent?.trim() ?? '';
			const url = titleLink?.getAttribute('href') ?? '';

			// 摘要：.b_caption p
			const snippetEl = element.querySelector('.b_caption p');
			const snippet = snippetEl?.textContent?.trim() ?? '';

			// 显示地址
			const displayUrlEl = element.querySelector('.b_attribution cite');
			const displayUrl = displayUrlEl?.textContent?.trim();

			if (title && url) {
				results.push({
					id: generateId(),
					title,
					url,
					snippet,
					...(displayUrl ? { displayUrl } : {}),
				});
			}
		} catch {
			// 跳过解析失败的单个结果项
		}
	});

	// 尝试提取结果总数
	let totalResults: number | undefined;
	const countEl = doc.querySelector('.sb_count');
	if (countEl) {
		const countText = countEl.textContent ?? '';
		const countMatch = countText.match(/[\d,]+/);
		if (countMatch) {
			const parsed = parseInt(countMatch[0].replace(/,/g, ''), 10);
			if (!isNaN(parsed) && parsed > 0) {
				totalResults = parsed;
			}
		}
	}

	return { query, results, totalResults };
}

/**
 * 将搜索响应格式化为文本结果
 */
function formatSearchResponse(response: BingSearchResponse): string {
	return JSON.stringify(response, null, 2);
}

/**
 * 创建必应搜索内置工具
 */
export function createBingSearchTools(): BuiltinTool[] {
	return [{
		name: 'bing_search',
			title: '必应中文搜索',
			description: `使用必应搜索引擎搜索中文互联网内容，并返回结构化搜索结果列表。

## 何时使用

- 需要搜索最新网络信息时
- 需要围绕某个主题查找候选网页时
- 需要先搜再配合 \`fetch\` 抓取详细内容时

## 何时不使用

- **不要用于抓取已知 URL 的正文**：这种情况请直接使用 \`fetch\`
- **不要用于搜索本地 Vault 内容**：本地内容请使用文件系统工具

## 可用字段

- **query**（必需）：搜索关键词或查询语句
- **count**（可选，默认 10）：返回结果数量，范围 1 到 50
- **offset**（可选，默认 0）：结果偏移量，用于翻页

## 返回值

返回 JSON 格式的搜索结果列表。每个结果通常包含 \`id\`、\`title\`、\`url\`、\`snippet\` 和可选的 \`displayUrl\`。

## 失败恢复

- 如果结果不理想，调整 \`query\` 后重试
- 如果只是想读取某个已知网页，不要继续重试 \`bing_search\`，应改用 \`fetch\`
- 如果是网络请求失败，可稍后重试

## 示例

\`\`\`json
{
  "query": "Obsidian MCP 工具定义",
  "count": 5,
  "offset": 0
}
\`\`\``,
			inputSchema: bingSearchSchema,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		async execute(args: BingSearchArgs) {
			const trimmedQuery = args.query.trim();
			if (!trimmedQuery) {
				throw new Error('搜索关键词不能为空');
			}

			// 限制 count 范围
			const count = Math.max(1, Math.min(50, args.count));
			const offset = Math.max(0, args.offset);

			const html = await fetchBingSearchPage(trimmedQuery, offset);
			const response = parseBingSearchHtml(html, trimmedQuery);

			// 按照 count 限制结果数量
			if (response.results.length > count) {
				response.results = response.results.slice(0, count);
			}

			return formatSearchResponse(response);
		},
	}];
}
