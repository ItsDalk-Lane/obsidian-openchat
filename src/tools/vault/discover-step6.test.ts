import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { findPathsSchema } from './find-paths/schema';
import { listDirectoryFlatSchema } from './list-directory-flat/schema';
import { listDirectoryTreeSchema } from './list-directory-tree/schema';
import { listVaultOverviewSchema } from './list-vault-overview/schema';

const readProjectFile = (relativePath: string): string =>
	fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

test('Step 06 discover 工具在单工具目录中声明统一的 discovery surface', () => {
	const findPathsToolSource = readProjectFile('src/tools/vault/find-paths/tool.ts');
	const flatToolSource = readProjectFile('src/tools/vault/list-directory-flat/tool.ts');
	const treeToolSource = readProjectFile('src/tools/vault/list-directory-tree/tool.ts');
	const overviewToolSource = readProjectFile(
		'src/tools/vault/list-vault-overview/tool.ts',
	);

	for (const source of [
		findPathsToolSource,
		flatToolSource,
		treeToolSource,
		overviewToolSource,
	]) {
		assert.match(source, /family: 'builtin\.vault\.discovery'/);
		assert.match(source, /isReadOnly: \(\) => true/);
	}
	assert.match(findPathsToolSource, /requiredArgsSummary: \['query'\]/);
});

test('discover wrapper schema 只接受查询条件或显式目录参数', () => {
	const parsedFindPaths = findPathsSchema.parse({
		query: 'meeting',
	});
	assert.equal(parsedFindPaths.scope_path, '/');
	assert.equal(parsedFindPaths.response_format, 'json');

	const flatArgs = listDirectoryFlatSchema.parse({
		directory_path: 'notes',
		include_sizes: true,
		sort_by: 'size',
		limit: 20,
		offset: 5,
	});
	assert.equal(flatArgs.directory_path, 'notes');
	assert.ok(!('response_format' in flatArgs));

	const treeArgs = listDirectoryTreeSchema.parse({
		directory_path: 'notes',
		exclude_patterns: ['templates/**'],
		max_depth: 3,
		max_nodes: 80,
	});
	assert.equal(treeArgs.directory_path, 'notes');
	assert.ok(!('response_format' in treeArgs));

	const overviewArgs = listVaultOverviewSchema.parse({
		file_extensions: ['md', 'canvas'],
		vault_limit: 200,
	});
	assert.deepEqual(overviewArgs.file_extensions, ['md', 'canvas']);
	assert.ok(!('directory_path' in overviewArgs));
});

test('legacy 注册入口已复用新的 discover 工具工厂，并保留 wrapper 兼容出口', () => {
	const searchSource = readProjectFile('src/tools/vault/filesystemSearchHandlers.ts');
	const wrapperSource = readProjectFile('src/tools/vault/filesystemWrapperTools.ts');
	const listDirSource = readProjectFile('src/tools/vault/filesystemListDirHandlers.ts');
	const wrapperSupportSource = readProjectFile(
		'src/tools/vault/filesystemWrapperSupport.ts',
	);

	assert.match(searchSource, /createFindPathsTool/);
	assert.match(
		searchSource,
		/registerBuiltinTool\(server, registry, createFindPathsTool\(app\)\)/,
	);
	assert.match(wrapperSource, /createListDirectoryFlatTool/);
	assert.match(wrapperSource, /createListDirectoryTreeTool/);
	assert.match(wrapperSource, /createListVaultOverviewTool/);
	assert.match(listDirSource, /createListDirectoryTool/);
	assert.match(
		wrapperSource,
		/registerBuiltinTool\(server, registry, createListDirectoryFlatTool\(app\)\)/,
	);
	assert.match(wrapperSupportSource, /from '\.\/list-directory-flat\/service'/);
	assert.match(wrapperSupportSource, /from '\.\/list-directory-tree\/service'/);
	assert.match(wrapperSupportSource, /from '\.\/list-vault-overview\/service'/);
	assert.match(
		listDirSource,
		/registerBuiltinTool\(server, registry, createListDirectoryTool\(app\)\)/,
	);
});
