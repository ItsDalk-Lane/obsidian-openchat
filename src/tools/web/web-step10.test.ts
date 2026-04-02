import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bingSearchSchema } from './bing-search/schema';
import { fetchSchema } from './fetch/schema';
import { createFetchWebpageTool } from './fetch-webpage/tool';
import { fetchWebpageSchema } from './fetch-webpage/schema';
import { createFetchWebpagesBatchTool } from './fetch-webpages-batch/tool';
import { fetchWebpagesBatchSchema } from './fetch-webpages-batch/schema';

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));

const readWebSource = async (relativePath: string): Promise<string> => {
	return await readFile(resolve(CURRENT_DIR, relativePath), 'utf8');
};

const createContext = () => {
	const progressMessages: string[] = [];
	return {
		context: {
			app: {} as never,
			callTool: async () => null,
			reportProgress: (event: { message?: string }) => {
				if (event.message) {
					progressMessages.push(event.message);
				}
			},
		},
		progressMessages,
	};
};

test('Step 10 schema 保持 fetch 兼容模式与 wrapper 窄 schema', () => {
	const legacySingle = fetchSchema.parse({
		url: 'https://example.com/article',
	});
	assert.equal(legacySingle.url, 'https://example.com/article');
	assert.equal(legacySingle.start_index, 0);
	assert.equal(legacySingle.max_length, 5000);
	assert.equal(legacySingle.raw, false);

	const legacyBatch = fetchSchema.parse({
		urls: ['https://example.com/a', 'https://example.com/b'],
	});
	assert.deepEqual(legacyBatch.urls, ['https://example.com/a', 'https://example.com/b']);
	assert.equal(legacyBatch.url, undefined);

	const wrapperSingle = fetchWebpageSchema.parse({
		url: 'https://example.com/article',
	});
	assert.equal(wrapperSingle.url, 'https://example.com/article');

	const wrapperBatch = fetchWebpagesBatchSchema.parse({
		urls: ['https://example.com/a'],
	});
	assert.deepEqual(wrapperBatch.urls, ['https://example.com/a']);

	const bingArgs = bingSearchSchema.parse({
		query: 'Obsidian',
	});
	assert.equal(bingArgs.count, 10);
	assert.equal(bingArgs.offset, 0);
});

test('Step 10 抓取工具会提供摘要并上报长网页与批量抓取进度', async () => {
	const fetchWebpageTool = createFetchWebpageTool({
		runtime: {
			fetchSingleUrl: async (url) =>
				`Contents of ${url}:\n正文\n\n<notice>内容已截断。使用 start_index=120\n调用 fetch_webpage 获取更多内容（剩余约 50 字符）。</notice>`,
		},
	});
	const fetchBatchTool = createFetchWebpagesBatchTool({
		runtime: {
			fetchBatch: async (urls) => urls.map((url, index) => ({
				url,
				success: index === 0,
				...(index === 0
					? { content: `Contents of ${url}:\nOK` }
					: { error: 'network failed' }),
			})),
		},
	});

	const singleRun = createContext();
	const batchRun = createContext();

	assert.equal(
		fetchWebpageTool.getToolUseSummary?.({
			url: 'https://example.com/article',
		}),
		'https://example.com/article',
	);
	assert.equal(
		fetchBatchTool.getActivityDescription?.({
			urls: ['https://example.com/a', 'https://example.com/b'],
		}),
		'批量抓取 2 个网页',
	);

	const singleResult = await fetchWebpageTool.execute({
		url: 'https://example.com/article',
		max_length: 120,
		start_index: 0,
		raw: false,
	}, singleRun.context);
	const batchResult = await fetchBatchTool.execute({
		urls: ['https://example.com/a', 'https://example.com/b'],
		max_length: 200,
		start_index: 0,
		raw: true,
	}, batchRun.context);

	assert.match(singleResult, /内容已截断/);
	assert.match(batchResult, /network failed/);
	assert.ok(singleRun.progressMessages.some((message) => message.includes('正在抓取网页')));
	assert.ok(singleRun.progressMessages.some((message) => message.includes('网页内容较长')));
	assert.ok(batchRun.progressMessages.some((message) => message.includes('开始批量抓取 2 个网页')));
	assert.ok(batchRun.progressMessages.some((message) => message.includes('成功 1 个，失败 1 个')));
});

test('Step 10 legacy 入口改为复用新 web 工具目录', async () => {
	const fetchToolsSource = await readWebSource('./fetch-tools.ts');
	const fetchWrapperSource = await readWebSource('./fetch-wrapper-tools.ts');
	const bingSearchSource = await readWebSource('./bing-search-tools.ts');
	const fetchToolSource = await readWebSource('./fetch/tool.ts');
	const bingToolSource = await readWebSource('./bing-search/tool.ts');

	assert.match(fetchToolsSource, /createFetchTool/);
	assert.match(fetchToolsSource, /fetch\/tool/);
	assert.match(fetchWrapperSource, /fetch-webpage\/tool/);
	assert.match(fetchWrapperSource, /fetch-webpages-batch\/tool/);
	assert.match(bingSearchSource, /bing-search\/tool/);
	assert.match(fetchToolSource, /compatibility/);
	assert.match(fetchToolSource, /validateFetchInput/);
	assert.match(fetchToolSource, /getActivityDescription/);
	assert.match(bingToolSource, /builtin\.web\.search/);
	assert.match(bingToolSource, /getToolUseSummary/);
});
