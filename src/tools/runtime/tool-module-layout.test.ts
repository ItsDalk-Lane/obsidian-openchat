import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
	BUILTIN_TOOL_MODULE_FILES,
	BUILTIN_TOOL_MODULE_LAYOUT,
	SHARED_TOOL_HELPER_DIRECTORY,
} from './tool-module-layout';

const REQUIRED_LAYOUT_FILES = [
	'src/tools/vault/_shared/helpers.ts',
	'src/tools/vault/_shared/path.ts',
	'src/tools/vault/_shared/result.ts',
	'src/tools/vault/_shared/query.ts',
	'src/tools/vault/read-file/tool.ts',
	'src/tools/vault/read-file/schema.ts',
	'src/tools/vault/read-file/description.ts',
	'src/tools/vault/read-file/service.ts',
	'src/tools/vault/read-media/tool.ts',
	'src/tools/vault/read-media/schema.ts',
	'src/tools/vault/read-media/description.ts',
	'src/tools/vault/read-media/service.ts',
	'src/tools/web/fetch/tool.ts',
	'src/tools/web/fetch/schema.ts',
	'src/tools/web/fetch/description.ts',
	'src/tools/web/fetch/service.ts',
	'src/tools/web/fetch-webpage/tool.ts',
	'src/tools/web/fetch-webpage/schema.ts',
	'src/tools/web/fetch-webpage/description.ts',
	'src/tools/web/fetch-webpage/service.ts',
	'src/tools/web/fetch-webpages-batch/tool.ts',
	'src/tools/web/fetch-webpages-batch/schema.ts',
	'src/tools/web/fetch-webpages-batch/description.ts',
	'src/tools/web/fetch-webpages-batch/service.ts',
] as const;

test('Step 04 目录约定常量符合路线图约束', () => {
	assert.equal(SHARED_TOOL_HELPER_DIRECTORY, '_shared');
	assert.deepEqual(BUILTIN_TOOL_MODULE_FILES, [
		'tool.ts',
		'schema.ts',
		'description.ts',
		'service.ts',
	]);
	assert.match(BUILTIN_TOOL_MODULE_LAYOUT['tool.ts'].purpose, /BuiltinTool/);
	assert.match(BUILTIN_TOOL_MODULE_LAYOUT['service.ts'].purpose, /业务逻辑/);
});

test('Step 04 骨架文件已经落在 vault/web 目录中', () => {
	for (const relativePath of REQUIRED_LAYOUT_FILES) {
		const absolutePath = path.resolve(process.cwd(), relativePath);
		assert.equal(
			fs.existsSync(absolutePath),
			true,
			`缺少骨架文件: ${relativePath}`,
		);
	}
});
