import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { queryIndexSchema } from './query-index/schema';
import { searchContentSchema } from './search-content/schema';

const readProjectFile = (relativePath: string): string =>
	fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

test('Step 07 搜索工具在单工具目录中声明 vault search surface', () => {
	const searchToolSource = readProjectFile('src/tools/vault/search-content/tool.ts');
	const queryToolSource = readProjectFile('src/tools/vault/query-index/tool.ts');

	for (const source of [searchToolSource, queryToolSource]) {
		assert.match(source, /family: 'builtin\.vault\.search'/);
		assert.match(source, /isReadOnly: \(\) => true/);
		assert.match(source, /hiddenSchemaFields: \['response_format'\]/);
	}
	assert.match(searchToolSource, /visibility: 'default'/);
	assert.match(queryToolSource, /visibility: 'candidate-only'/);
	assert.match(queryToolSource, /requiredArgsSummary: \['data_source', 'select'\]/);
});

test('Step 07 schema 默认值保持兼容', () => {
	const parsedSearch = searchContentSchema.parse({
		pattern: 'TODO',
	});
	assert.equal(parsedSearch.match_mode, 'literal');
	assert.equal(parsedSearch.scope_path, '/');
	assert.deepEqual(parsedSearch.file_types, []);
	assert.equal(parsedSearch.max_results, 50);
	assert.equal(parsedSearch.case_sensitive, false);
	assert.equal(parsedSearch.context_lines, 0);
	assert.equal(parsedSearch.response_format, 'json');

	const parsedQuery = queryIndexSchema.parse({
		data_source: 'tag',
		select: {
			fields: ['tag'],
		},
	});
	assert.deepEqual(parsedQuery.select.aggregates, []);
	assert.equal(parsedQuery.limit, 100);
	assert.equal(parsedQuery.offset, 0);
	assert.equal(parsedQuery.response_format, 'json');
});

test('legacy 搜索注册入口已复用新的单工具工厂', () => {
	const searchSource = readProjectFile('src/tools/vault/filesystemSearchHandlers.ts');
	const descriptionsSource = readProjectFile('src/tools/vault/filesystemToolDescriptions.ts');

	assert.match(searchSource, /createSearchContentTool/);
	assert.match(searchSource, /createQueryIndexTool/);
	assert.match(
		searchSource,
		/registerBuiltinTool\(server, registry, createSearchContentTool\(app\)\)/,
	);
	assert.match(
		searchSource,
		/registerBuiltinTool\(server, registry, createQueryIndexTool\(app\)\)/,
	);
	assert.match(descriptionsSource, /from '\.\/search-content\/description'/);
	assert.match(descriptionsSource, /from '\.\/query-index\/description'/);
});