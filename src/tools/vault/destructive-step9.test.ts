import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { deleteFileSchema } from './delete-path/schema';
import { moveFileSchema } from './move-path/schema';

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));

const readVaultSource = async (relativePath: string): Promise<string> => {
	return await readFile(resolve(CURRENT_DIR, relativePath), 'utf8');
};

test('Step 9 schema 保持 move_path / delete_path 的兼容默认值', () => {
	const moveArgs = moveFileSchema.parse({
		source_path: 'notes/a.md',
		destination_path: 'archive/a.md',
	});
	assert.equal(moveArgs.source_path, 'notes/a.md');
	assert.equal(moveArgs.destination_path, 'archive/a.md');

	const deleteArgs = deleteFileSchema.parse({
		target_path: 'notes/a.md',
	});
	assert.equal(deleteArgs.target_path, 'notes/a.md');
	assert.equal(deleteArgs.force, true);
});

test('Step 9 tool 源码声明 destructive 确认流与并发风险', async () => {
	const moveToolSource = await readVaultSource('./move-path/tool.ts');
	const deleteToolSource = await readVaultSource('./delete-path/tool.ts');

	assert.match(moveToolSource, /checkPermissions:/);
	assert.match(moveToolSource, /isConcurrencySafe: \(\) => false/);
	assert.match(moveToolSource, /getActivityDescription:/);
	assert.match(deleteToolSource, /checkPermissions:/);
	assert.match(deleteToolSource, /riskLevel: 'destructive'/);
	assert.match(deleteToolSource, /visibility: 'workflow-only'/);
	assert.match(deleteToolSource, /isDestructive: \(\) => true/);
});

test('Step 9 legacy 入口与描述文件改为复用新破坏性工具目录', async () => {
	const handlerSource = await readVaultSource('./filesystemSearchHandlers.ts');
	const readWriteHandlerSource = await readVaultSource('./filesystemReadWriteHandlers.ts');
	const descriptionsSource = await readVaultSource('./filesystemToolDescriptions.ts');
	const moveDescriptionSource = await readVaultSource('./move-path/description.ts');
	const deleteDescriptionSource = await readVaultSource('./delete-path/description.ts');

	assert.doesNotMatch(handlerSource, /createMovePathTool\(app\)/);
	assert.doesNotMatch(handlerSource, /createDeletePathTool\(app\)/);
	assert.match(readWriteHandlerSource, /createMovePathTool\(app\)/);
	assert.match(readWriteHandlerSource, /createDeletePathTool\(app\)/);
	assert.match(descriptionsSource, /move-path\/description/);
	assert.match(descriptionsSource, /delete-path\/description/);
	assert.match(moveDescriptionSource, /目标路径仍不稳定时/);
	assert.match(deleteDescriptionSource, /永久删除/);
});
