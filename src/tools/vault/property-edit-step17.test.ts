import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
	propertyEditResultSchema,
	propertyEditSchema,
} from './property-edit/schema';

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));

const readVaultSource = async (relativePath: string): Promise<string> => {
	return await readFile(resolve(CURRENT_DIR, relativePath), 'utf8');
};

test('Step 17 schema 支持 set delete append remove 四类属性操作', () => {
	const parsed = propertyEditSchema.parse({
		file_path: 'notes/demo.md',
		operations: [
			{ action: 'set', key: 'status', value: 'active' },
			{ action: 'delete', key: 'obsolete' },
			{ action: 'append', key: 'tags', value: 'roadmap' },
			{ action: 'remove', key: 'tags', value: 'draft' },
		],
	});

	assert.equal(parsed.file_path, 'notes/demo.md');
	assert.equal(parsed.operations.length, 4);
	assert.deepEqual(Object.keys(propertyEditResultSchema.shape).sort(), [
		'diff_preview',
		'file_path',
		'updated_keys',
	]);
});

test('Step 17 frontmatter helper 源码明确负责 YAML 解析与回写', async () => {
	const helperSource = await readVaultSource('./_shared/frontmatter.ts');

	assert.match(helperSource, /parseYaml/);
	assert.match(helperSource, /stringifyYaml/);
	assert.match(helperSource, /const FRONTMATTER_DELIMITER = '---'/);
	assert.match(helperSource, /frontmatter 未正确闭合/);
	assert.match(helperSource, /frontmatter 必须是对象/);
});

test('Step 17 tool 与 legacy 注册入口都已接入 property_edit', async () => {
	const toolSource = await readVaultSource('./property-edit/tool.ts');
	const serviceSource = await readVaultSource('./property-edit/service.ts');
	const handlerSource = await readVaultSource('./filesystemReadWriteHandlers.ts');
	const descriptionSource = await readVaultSource('./property-edit/description.ts');

	assert.match(toolSource, /PROPERTY_EDIT_TOOL_NAME = 'property_edit'/);
	assert.match(toolSource, /family: 'builtin\.vault\.property'/);
	assert.match(toolSource, /checkPermissions:/);
	assert.match(toolSource, /isDestructive:/);
	assert.match(serviceSource, /property_edit 目前只支持 Markdown 文件/);
	assert.match(serviceSource, /case 'set'/);
	assert.match(serviceSource, /case 'delete'/);
	assert.match(serviceSource, /case 'append'/);
	assert.match(serviceSource, /case 'remove'/);
	assert.match(handlerSource, /createPropertyEditTool\(app\)/);
	assert.match(descriptionSource, /替代脆弱的 \\`edit_file\\` 文本替换/);
});
