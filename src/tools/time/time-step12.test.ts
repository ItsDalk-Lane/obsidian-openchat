import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createCalculateTimeRangeTool } from './calculate-time-range/tool';
import { createConvertTimeTool } from './convert-time/tool';
import { createGetCurrentTimeTool } from './get-current-time/tool';
import { createGetTimeTool } from './get-time/tool';
import { createTimeTools } from './time-tools';
import { createTimeWrapperTools } from './time-wrapper-tools';

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const OPTIONS = { defaultTimezone: 'UTC' };

const readTimeSource = async (relativePath: string): Promise<string> => {
	return await readFile(resolve(CURRENT_DIR, relativePath), 'utf8');
};

const normalizeDatetimeSeconds = (value: unknown): string => {
	return String(value).replace(/\.\d{3}(?=Z$)/u, '');
};

test('Step 12 get_time 会把模式校验前移到 validateInput', async () => {
	const tool = createGetTimeTool(OPTIONS);
	const context = {
		app: {} as never,
		callTool: async () => null,
	};

	const invalidConvert = await tool.validateInput?.({
		mode: 'convert',
		source_timezone: 'Asia/Shanghai',
	}, context);
	assert.equal(invalidConvert?.ok, false);
	assert.match(invalidConvert?.summary ?? '', /target_timezone/);

	const invalidCurrent = await tool.validateInput?.({
		mode: 'current',
		time: '09:30',
	}, context);
	assert.equal(invalidCurrent?.ok, false);
	assert.match(invalidCurrent?.summary ?? '', /current 模式不支持参数 time/);

	const validRange = await tool.validateInput?.({
		mode: 'range',
		natural_time: 'last week',
		timezone: 'UTC',
	}, context);
	assert.deepEqual(validRange, { ok: true });
});

test('Step 12 wrapper 与 legacy get_time 在三种模式下保持兼容结果', async () => {
	const context = {
		app: {} as never,
		callTool: async () => null,
	};
	const legacy = createTimeTools(OPTIONS).find((tool) => tool.name === 'get_time');
	assert.ok(legacy);

	const currentWrapper = createGetCurrentTimeTool(OPTIONS);
	const convertWrapper = createConvertTimeTool(OPTIONS);
	const rangeWrapper = createCalculateTimeRangeTool(OPTIONS);

	const currentArgs = { timezone: 'UTC' };
	const currentLegacy = await legacy.execute({ mode: 'current', ...currentArgs }, context);
	const currentWrapperResult = await currentWrapper.execute(currentArgs, context);
	const { mode: _currentMode, ...currentPayload } = currentLegacy as Record<string, unknown>;
	assert.deepEqual(
		{
			...currentWrapperResult,
			datetime: normalizeDatetimeSeconds(currentWrapperResult.datetime),
		},
		{
			...currentPayload,
			datetime: normalizeDatetimeSeconds(currentPayload.datetime),
		},
	);

	const convertArgs = {
		source_timezone: 'Asia/Shanghai',
		target_timezone: 'Europe/London',
		time: '09:30',
	};
	const convertLegacy = await legacy.execute({ mode: 'convert', ...convertArgs }, context);
	const convertWrapperResult = await convertWrapper.execute(convertArgs, context);
	const { mode: _convertMode, ...convertPayload } = convertLegacy as Record<string, unknown>;
	assert.deepEqual(convertWrapperResult, convertPayload);

	const rangeArgs = {
		natural_time: 'last week',
		timezone: 'UTC',
	};
	const rangeLegacy = await legacy.execute({ mode: 'range', ...rangeArgs }, context);
	const rangeWrapperResult = await rangeWrapper.execute(rangeArgs, context);
	const { mode: _rangeMode, ...rangePayload } = rangeLegacy as Record<string, unknown>;
	assert.deepEqual(rangeWrapperResult, rangePayload);
});

test('Step 12 legacy 入口改为复用新 time 工具目录', async () => {
	const timeToolsSource = await readTimeSource('./time-tools.ts');
	const timeWrapperSource = await readTimeSource('./time-wrapper-tools.ts');
	const getTimeToolSource = await readTimeSource('./get-time/tool.ts');
	const wrapperToolSource = await readTimeSource('./convert-time/tool.ts');

	assert.match(timeToolsSource, /get-time\/tool/);
	assert.match(timeWrapperSource, /get-current-time\/tool/);
	assert.match(timeWrapperSource, /convert-time\/tool/);
	assert.match(timeWrapperSource, /calculate-time-range\/tool/);
	assert.match(getTimeToolSource, /compatibility/);
	assert.match(getTimeToolSource, /validateInput:/);
	assert.match(wrapperToolSource, /oneLinePurpose/);
});

test('Step 12 wrapper 工具数组与 legacy 工具数组仍可创建', () => {
	const legacyTools = createTimeTools(OPTIONS);
	const wrapperTools = createTimeWrapperTools(OPTIONS);

	assert.deepEqual(legacyTools.map((tool) => tool.name), ['get_time']);
	assert.deepEqual(wrapperTools.map((tool) => tool.name), [
		'get_current_time',
		'convert_time',
		'calculate_time_range',
	]);
});
