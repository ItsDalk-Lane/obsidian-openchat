import type { BuiltinTool } from '../../runtime/types';
import { buildBuiltinTool } from '../../runtime/build-tool';
import type { RegisterTimeToolsOptions } from '../get-time/tool';
import { CONVERT_TIME_DESCRIPTION } from './description';
import {
	executeConvertTimeTool,
	summarizeConvertTime,
	validateConvertTimeInput,
} from './service';
import {
	convertTimeResultSchema,
	convertTimeSchema,
	timeAnnotations,
	type ConvertTimeResult,
	type ConvertTimeArgs,
} from './schema';

export const CONVERT_TIME_TOOL_NAME = 'convert_time';

export const createConvertTimeTool = (
	_options: RegisterTimeToolsOptions,
): BuiltinTool<ConvertTimeArgs, ConvertTimeResult> => buildBuiltinTool<
	ConvertTimeArgs,
	ConvertTimeResult
>({
	name: CONVERT_TIME_TOOL_NAME,
	title: '转换时间',
	description: CONVERT_TIME_DESCRIPTION,
	inputSchema: convertTimeSchema,
	outputSchema: convertTimeResultSchema,
	annotations: timeAnnotations,
	surface: {
		family: 'builtin.time',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '把一个时间从源时区换算到目标时区。',
		capabilityTags: [
			'convert',
			'timezone convert',
			'time conversion',
			'时区转换',
			'时间换算',
		],
		requiredArgsSummary: ['source_timezone', 'target_timezone', 'time'],
	},
	isReadOnly: () => true,
	validateInput: (args) => validateConvertTimeInput(args),
	getToolUseSummary: summarizeConvertTime,
	getActivityDescription: () => '转换时间',
	execute: (args) => executeConvertTimeTool(args),
});
