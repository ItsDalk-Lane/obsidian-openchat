import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const readProjectFile = (relativePath: string): string => {
	return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
};

test('Step 05 的三个 Vault 读取/导航工具已落到各自目录', () => {
	const readFileToolSource = readProjectFile('src/tools/vault/read-file/tool.ts');
	const readMediaToolSource = readProjectFile('src/tools/vault/read-media/tool.ts');
	const openFileToolSource = readProjectFile('src/tools/vault/open-file/tool.ts');

	assert.match(readFileToolSource, /export const createReadFileTool =/);
	assert.match(readMediaToolSource, /export const createReadMediaTool =/);
	assert.match(openFileToolSource, /export const createOpenFileTool =/);

	assert.doesNotMatch(readFileToolSource, /Step 04 骨架/);
	assert.doesNotMatch(readMediaToolSource, /Step 04 骨架/);
	assert.doesNotMatch(openFileToolSource, /Step 04 骨架/);
});

test('旧注册入口已复用新目录下的工具工厂', () => {
	const readWriteSource = readProjectFile(
		'src/tools/vault/filesystemReadWriteHandlers.ts',
	);
	const navSource = readProjectFile('src/tools/vault/nav-tools.ts');

	assert.match(readWriteSource, /createReadFileTool/);
	assert.match(readWriteSource, /createReadMediaTool/);
	assert.match(
		readWriteSource,
		/registerBuiltinTool\(server, registry, createReadFileTool\(app\)\)/,
	);
	assert.match(
		readWriteSource,
		/registerBuiltinTool\(server, registry, createReadMediaTool\(app\)\)/,
	);
	assert.match(navSource, /createOpenFileTool/);
	assert.match(
		navSource,
		/registerBuiltinTool\(server, registry, createOpenFileTool\(app\)\)/,
	);
});

test('open_file 在邻近定义中补齐了避免误用与稳定目标语义', () => {
	const openFileToolSource = readProjectFile('src/tools/vault/open-file/tool.ts');
	const openFileDescriptionSource = readProjectFile(
		'src/tools/vault/open-file/description.ts',
	);

	assert.match(openFileToolSource, /whenNotToUse/);
	assert.match(openFileToolSource, /已知且稳定的文件目标/);
	assert.match(openFileDescriptionSource, /目标文件已经稳定明确/);
	assert.match(openFileDescriptionSource, /路径仍然模糊的目标/);
});
