import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
	backlinkAnalyzeResultSchema,
	backlinkAnalyzeSchema,
} from './backlink-analyze/schema';

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));

const readGraphSource = async (relativePath: string): Promise<string> => {
	return await readFile(resolve(CURRENT_DIR, relativePath), 'utf8');
};

test('Step 18 schema 保持一跳 backlink 分析的输入输出边界', () => {
	const parsed = backlinkAnalyzeSchema.parse({
		file_path: 'notes/demo.md',
	});

	assert.equal(parsed.file_path, 'notes/demo.md');
	assert.equal(parsed.include_outgoing, true);
	assert.equal(parsed.include_unresolved, false);
	assert.equal(parsed.depth, 1);
	assert.deepEqual(Object.keys(backlinkAnalyzeResultSchema.shape).sort(), [
		'file_path',
		'incoming',
		'mutual',
		'outgoing',
		'unresolved',
	]);
});

test('Step 18 service 源码明确收敛到一跳 incoming/outgoing/mutual/unresolved 分析', async () => {
	const serviceSource = await readGraphSource('./backlink-analyze/service.ts');

	assert.match(serviceSource, /backlink_analyze 当前阶段只支持 depth=1/);
	assert.match(serviceSource, /getBacklinksForFile/);
	assert.match(serviceSource, /getFileCache/);
	assert.match(serviceSource, /frontmatterLinks/);
	assert.match(serviceSource, /embeds/);
	assert.match(serviceSource, /mutual: getMutualPaths/);
	assert.match(serviceSource, /include_unresolved/);
});

test('Step 18 runtime 已接入 graph 工具工厂与 backlink_analyze', async () => {
	const toolSource = await readGraphSource('./backlink-analyze/tool.ts');
	const graphToolsSource = await readGraphSource('./graph-tools.ts');
	const runtimeSource = await readGraphSource('../runtime/BuiltinToolsRuntime.ts');

	assert.match(toolSource, /BACKLINK_ANALYZE_TOOL_NAME = 'backlink_analyze'/);
	assert.match(toolSource, /family: 'builtin\.graph\.backlink'/);
	assert.match(toolSource, /visibility: 'candidate-only'/);
	assert.match(toolSource, /riskLevel: 'read-only'/);
	assert.match(graphToolsSource, /createBacklinkAnalyzeTool\(app\)/);
	assert.match(runtimeSource, /createGraphTools/);
	assert.match(runtimeSource, /registry\.registerAll\(createGraphTools\(options\.app\)\)/);
});
