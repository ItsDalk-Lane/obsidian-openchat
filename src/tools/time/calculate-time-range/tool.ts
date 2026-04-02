import type { BuiltinTool } from '../../runtime/types';
import { buildBuiltinTool } from '../../runtime/build-tool';
import type { RegisterTimeToolsOptions } from '../get-time/tool';
import { CALCULATE_TIME_RANGE_DESCRIPTION } from './description';
import {
	executeCalculateTimeRangeTool,
	summarizeCalculateTimeRange,
	validateCalculateTimeRangeInput,
} from './service';
import {
	calculateTimeRangeResultSchema,
	calculateTimeRangeSchema,
	timeAnnotations,
	type CalculateTimeRangeResult,
	type CalculateTimeRangeArgs,
} from './schema';

export const CALCULATE_TIME_RANGE_TOOL_NAME = 'calculate_time_range';

export const createCalculateTimeRangeTool = (
	options: RegisterTimeToolsOptions,
): BuiltinTool<CalculateTimeRangeArgs, CalculateTimeRangeResult> => buildBuiltinTool<
	CalculateTimeRangeArgs,
	CalculateTimeRangeResult
>({
	name: CALCULATE_TIME_RANGE_TOOL_NAME,
	title: '计算时间范围',
	description: CALCULATE_TIME_RANGE_DESCRIPTION,
	inputSchema: calculateTimeRangeSchema,
	outputSchema: calculateTimeRangeResultSchema,
	annotations: timeAnnotations,
	surface: {
		family: 'builtin.time',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '把自然语言时间表达解析为时间范围。',
		capabilityTags: [
			'range',
			'time range',
			'natural time',
			'昨天',
			'上周',
			'时间范围',
		],
		requiredArgsSummary: ['natural_time', 'timezone'],
	},
	isReadOnly: () => true,
	validateInput: (args) => validateCalculateTimeRangeInput(args),
	getToolUseSummary: summarizeCalculateTimeRange,
	getActivityDescription: () => '计算时间范围',
	execute: (args) => executeCalculateTimeRangeTool(args, options),
});
