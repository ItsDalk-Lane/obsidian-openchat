import { requestUrl } from 'obsidian';
import type { BuiltinValidationResult } from '../../runtime/types';
import type { BingSearchArgs } from './schema';

const BING_SEARCH_URL = 'https://cn.bing.com/search';

const BING_USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
	+ '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface BingSearchResultItem {
	id: string;
	title: string;
	url: string;
	snippet: string;
	displayUrl?: string;
}

interface BingSearchResponse {
	query: string;
	results: BingSearchResultItem[];
	totalResults?: number;
}

const normalizeQuery = (query?: string | null): string | null => {
	const trimmed = query?.trim();
	return trimmed ? trimmed : null;
};

export const summarizeBingSearchTarget = (
	args: Partial<BingSearchArgs>,
): string | null => {
	return normalizeQuery(args.query);
};

export const describeBingSearchActivity = (
	args: Partial<BingSearchArgs>,
): string | null => {
	const query = normalizeQuery(args.query);
	return query ? `必应搜索 ${query}` : null;
};

export const validateBingSearchInput = (
	args: BingSearchArgs,
): BuiltinValidationResult => {
	return normalizeQuery(args.query)
		? { ok: true }
		: {
			ok: false,
			summary: '搜索关键词不能为空。',
			notes: ['请提供更明确的搜索词或查询语句。'],
		};
};

function generateId(): string {
	const ts = Date.now().toString(36);
	const rand = Math.random().toString(36).slice(2, 8);
	return `${ts}-${rand}`;
}

async function fetchBingSearchPage(
	query: string,
	offset: number,
): Promise<string> {
	const params = new URLSearchParams({
		q: query,
		first: String(offset + 1),
	});

	const response = await requestUrl({
		url: `${BING_SEARCH_URL}?${params.toString()}`,
		method: 'GET',
		headers: {
			'User-Agent': BING_USER_AGENT,
			'Accept':
				'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
		},
		throw: false,
	});

	if (response.status >= 400) {
		throw new Error(
			`必应搜索请求失败（状态码: ${response.status}）。请检查网络连接或稍后重试。`,
		);
	}

	return response.text;
}

function parseBingSearchHtml(
	html: string,
	query: string,
): BingSearchResponse {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');
	const results: BingSearchResultItem[] = [];

	doc.querySelectorAll('.b_algo').forEach((element) => {
		const titleLink = element.querySelector('h2 a');
		const title = titleLink?.textContent?.trim() ?? '';
		const url = titleLink?.getAttribute('href') ?? '';
		const snippet = element.querySelector('.b_caption p')?.textContent?.trim() ?? '';
		const displayUrl =
			element.querySelector('.b_attribution cite')?.textContent?.trim() ?? undefined;

		if (!title || !url) {
			return;
		}

		results.push({
			id: generateId(),
			title,
			url,
			snippet,
			...(displayUrl ? { displayUrl } : {}),
		});
	});

	const countText = doc.querySelector('.sb_count')?.textContent ?? '';
	const countMatch = countText.match(/[\d,]+/);
	const parsedCount = countMatch
		? parseInt(countMatch[0].replace(/,/g, ''), 10)
		: NaN;

	return {
		query,
		results,
		...(!Number.isNaN(parsedCount) && parsedCount > 0
			? { totalResults: parsedCount }
			: {}),
	};
}

export const executeBingSearch = async (
	args: BingSearchArgs,
): Promise<string> => {
	const query = normalizeQuery(args.query);
	if (!query) {
		throw new Error('搜索关键词不能为空');
	}

	const count = Math.max(1, Math.min(50, args.count));
	const offset = Math.max(0, args.offset);
	const html = await fetchBingSearchPage(query, offset);
	const response = parseBingSearchHtml(html, query);

	if (response.results.length > count) {
		response.results = response.results.slice(0, count);
	}

	return JSON.stringify(response, null, 2);
};
