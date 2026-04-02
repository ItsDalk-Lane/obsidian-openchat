import type { BuiltinTool } from '../runtime/types';
import {
	createGetTimeTool,
	GET_TIME_TOOL_NAME,
	type RegisterTimeToolsOptions,
} from './get-time/tool';

export {
	GET_TIME_TOOL_NAME,
};

export type {
	RegisterTimeToolsOptions,
} from './get-time/tool';

export const createTimeTools = (
	options: RegisterTimeToolsOptions,
): BuiltinTool[] => [createGetTimeTool(options)];
