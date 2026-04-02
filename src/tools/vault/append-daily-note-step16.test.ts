import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
	appendDailyNoteResultSchema,
	appendDailyNoteSchema,
} from './append-daily-note/schema';

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));

const readVaultSource = async (relativePath: string): Promise<string> => {
	return await readFile(resolve(CURRENT_DIR, relativePath), 'utf8');
};

test('Step 16 schema 只暴露 date / content / section_heading 三个输入字段', () => {
	const parsed = appendDailyNoteSchema.parse({
		content: '- 记录一条 daily note',
	});
	assert.deepEqual(parsed, {
		content: '- 记录一条 daily note',
	});

	assert.deepEqual(Object.keys(appendDailyNoteSchema.shape).sort(), [
		'content',
		'date',
		'section_heading',
	]);
	assert.deepEqual(Object.keys(appendDailyNoteResultSchema.shape).sort(), [
		'created',
		'file_path',
		'inserted_under_heading',
		'updated',
	]);
});

test('Step 16 helper 源码把 daily note 路径解析收敛在工具内部', async () => {
	const helperSource = await readVaultSource('./_shared/daily-note.ts');

	assert.match(helperSource, /const DAILY_NOTES_CONFIG_PATH = '.obsidian\/daily-notes\.json'/);
	assert.match(helperSource, /const DEFAULT_DAILY_NOTE_FORMAT = 'YYYY-MM-DD'/);
	assert.match(helperSource, /const format = config\.format \|\| DEFAULT_DAILY_NOTE_FORMAT/);
	assert.match(helperSource, /const formattedPath = momentValue\.format\(format\)\.trim\(\)/);
	assert.match(helperSource, /const fileName = formattedPath\.endsWith\('\.md'\)/);
	assert.match(helperSource, /normalizeAndValidatePath\(filePath\)/);
	assert.match(helperSource, /buildSectionBlock\(sectionHeading, normalizedContent\)/);
});

test('Step 16 tool 与 legacy 注册入口都已接入 append_daily_note', async () => {
	const toolSource = await readVaultSource('./append-daily-note/tool.ts');
	const handlerSource = await readVaultSource('./filesystemReadWriteHandlers.ts');
	const descriptionSource = await readVaultSource('./append-daily-note/description.ts');

	assert.match(toolSource, /APPEND_DAILY_NOTE_TOOL_NAME = 'append_daily_note'/);
	assert.match(toolSource, /family: 'builtin\.note\.daily'/);
	assert.match(toolSource, /visibility: 'default'/);
	assert.match(toolSource, /riskLevel: 'mutating'/);
	assert.match(toolSource, /validateInput:/);
	assert.match(toolSource, /getToolUseSummary:/);
	assert.match(toolSource, /getActivityDescription:/);
	assert.match(handlerSource, /createAppendDailyNoteTool\(app\)/);
	assert.match(descriptionSource, /不想让模型自己猜路径规则时/);
	assert.match(descriptionSource, /date.*content.*section_heading/s);
});
