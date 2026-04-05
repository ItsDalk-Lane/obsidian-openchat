import type { BuiltinTool } from '../runtime/types';
import {
	type RegisterTimeToolsOptions,
} from './get-time/tool';
import { createCalculateTimeRangeTool } from './calculate-time-range/tool';
import { createConvertTimeTool } from './convert-time/tool';
import { createGetCurrentTimeTool } from './get-current-time/tool';

export const createTimeTools = (
	options: RegisterTimeToolsOptions,
): BuiltinTool[] => [
	createGetCurrentTimeTool(options),
	createConvertTimeTool(options),
	createCalculateTimeRangeTool(options),
];
