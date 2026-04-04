import type { BuiltinTool } from '../runtime/types';
import {
	type RegisterTimeToolsOptions,
} from './get-time/tool';
import { createCalculateTimeRangeTool } from './calculate-time-range/tool';
import { createConvertTimeTool } from './convert-time/tool';
import { createGetCurrentTimeTool } from './get-current-time/tool';

export {
	GET_CURRENT_TIME_TOOL_NAME,
} from './get-current-time/tool';
export {
	CONVERT_TIME_TOOL_NAME,
} from './convert-time/tool';
export {
	CALCULATE_TIME_RANGE_TOOL_NAME,
} from './calculate-time-range/tool';

export type {
	RegisterTimeToolsOptions,
} from './get-time/tool';

export const createTimeTools = (
	options: RegisterTimeToolsOptions,
): BuiltinTool[] => [
	createGetCurrentTimeTool(options),
	createConvertTimeTool(options),
	createCalculateTimeRangeTool(options),
];
