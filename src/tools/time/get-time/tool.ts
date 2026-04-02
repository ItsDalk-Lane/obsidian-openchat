import type { BuiltinTool } from '../../runtime/types';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { GET_TIME_DESCRIPTION } from './description';
import {
	describeGetTimeActivity,
	executeGetTime,
	summarizeGetTime,
	validateGetTimeInput,
} from './service';
import {
	getTimeResultSchema,
	getTimeSchema,
	timeAnnotations,
	type GetTimeArgs,
	type GetTimeResult,
} from './schema';

export interface RegisterTimeToolsOptions {
	readonly defaultTimezone: string;
}

export const GET_TIME_TOOL_NAME = 'get_time';

export const createGetTimeTool = (
	options: RegisterTimeToolsOptions,
): BuiltinTool<GetTimeArgs, GetTimeResult> => buildBuiltinTool<GetTimeArgs, GetTimeResult>({
	name: GET_TIME_TOOL_NAME,
	title: '获取或转换时间',
	description: GET_TIME_DESCRIPTION,
	inputSchema: getTimeSchema,
	outputSchema: getTimeResultSchema,
	annotations: timeAnnotations,
	surface: {
		family: 'builtin.time',
		visibility: 'default',
		argumentComplexity: 'high',
		riskLevel: 'read-only',
		oneLinePurpose:
			'兼容型时间工具；默认优先使用 get_current_time、convert_time 或 calculate_time_range。',
		whenNotToUse: [
			'当前时间请用 get_current_time',
			'时区换算请用 convert_time',
			'自然语言时间范围请用 calculate_time_range',
		],
		capabilityTags: ['time', 'timezone', 'date', '时区', '时间', '日期'],
		requiredArgsSummary: ['mode', 'timezone 或时区参数'],
		compatibility: {
			deprecationStatus: 'legacy',
		},
	},
	isReadOnly: () => true,
	validateInput: (args) => validateGetTimeInput(args),
	getToolUseSummary: summarizeGetTime,
	getActivityDescription: describeGetTimeActivity,
	execute: (args) => executeGetTime(args, options.defaultTimezone),
});
