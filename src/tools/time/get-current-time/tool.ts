import type { BuiltinTool } from '../../runtime/types';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { GET_CURRENT_TIME_DESCRIPTION } from './description';
import {
	executeGetCurrentTimeTool,
	summarizeGetCurrentTime,
	validateGetCurrentTimeInput,
} from './service';
import {
	getCurrentTimeResultSchema,
	getCurrentTimeSchema,
	timeAnnotations,
	type GetCurrentTimeArgs,
} from './schema';
import type { RegisterTimeToolsOptions } from '../get-time/tool';
import type { TimeResultPayload } from '../get-time/schema';

export const GET_CURRENT_TIME_TOOL_NAME = 'get_current_time';

export const createGetCurrentTimeTool = (
	options: RegisterTimeToolsOptions,
): BuiltinTool<GetCurrentTimeArgs, TimeResultPayload> => buildBuiltinTool<
	GetCurrentTimeArgs,
	TimeResultPayload
>({
	name: GET_CURRENT_TIME_TOOL_NAME,
	title: '获取当前时间',
	description: GET_CURRENT_TIME_DESCRIPTION,
	inputSchema: getCurrentTimeSchema,
	outputSchema: getCurrentTimeResultSchema,
	annotations: timeAnnotations,
	surface: {
		family: 'builtin.time',
		visibility: 'default',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '获取某个时区的当前时间。',
		capabilityTags: [
			'current time',
			'time',
			'timezone',
			'现在时间',
			'当前时间',
			'时区',
		],
		requiredArgsSummary: ['timezone'],
	},
	isReadOnly: () => true,
	validateInput: (args) => validateGetCurrentTimeInput(args),
	getToolUseSummary: summarizeGetCurrentTime,
	getActivityDescription: () => '获取当前时间',
	execute: (args) => executeGetCurrentTimeTool(args, options),
});
