import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { editFileSchema } from './edit-file/schema';
import { writeFileSchema } from './write-file/schema';

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));

const readVaultSource = async (relativePath: string): Promise<string> => {
	return await readFile(resolve(CURRENT_DIR, relativePath), 'utf8');
};

test('Step 8 schema 保持 write_file / edit_file 的兼容默认值', () => {
	const writeArgs = writeFileSchema.parse({
		file_path: 'notes/out.md',
		content: 'hello',
	});
	assert.equal(writeArgs.file_path, 'notes/out.md');
	assert.equal(writeArgs.content, 'hello');

	const editArgs = editFileSchema.parse({
		file_path: 'notes/out.md',
		edits: [{ oldText: 'hello', newText: 'world' }],
	});
	assert.equal(editArgs.dry_run, false);
	assert.equal(editArgs.edits.length, 1);
});

test('Step 8 tool 源码声明写入校验、确认与动态风险钩子', async () => {
	const writeToolSource = await readVaultSource('./write-file/tool.ts');
	const editToolSource = await readVaultSource('./edit-file/tool.ts');

	assert.match(writeToolSource, /validateInput:/);
	assert.match(writeToolSource, /checkPermissions:/);
	assert.match(writeToolSource, /isDestructive:/);
	assert.match(editToolSource, /validateInput:/);
	assert.match(editToolSource, /checkPermissions:/);
	assert.match(editToolSource, /isReadOnly:/);
	assert.match(editToolSource, /isConcurrencySafe:/);
});

test('Step 8 legacy 入口与描述文件改为复用新写入工具目录', async () => {
	const handlerSource = await readVaultSource('./filesystemReadWriteHandlers.ts');
	const descriptionsSource = await readVaultSource('./filesystemToolDescriptions.ts');
	const editDescriptionSource = await readVaultSource('./edit-file/description.ts');

	assert.match(handlerSource, /createWriteFileTool\(app\)/);
	assert.match(handlerSource, /createEditFileTool\(app\)/);
	assert.match(descriptionsSource, /write-file\/description/);
	assert.match(descriptionsSource, /edit-file\/description/);
	assert.match(editDescriptionSource, /最小连续文本/);
});
