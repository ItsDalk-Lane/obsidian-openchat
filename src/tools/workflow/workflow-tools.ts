import type { BuiltinTool } from '../runtime/types';
import {
	ASK_USER_TOOL_NAME,
	createAskUserTool,
} from './ask-user/tool';

export {
	ASK_USER_TOOL_NAME,
};

export const createWorkflowTools = (): BuiltinTool[] => [
	createAskUserTool(),
];
