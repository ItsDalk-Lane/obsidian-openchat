import type { BuiltinTool } from '../runtime/types';
import {
	createGetFirstLinkPathTool,
	GET_FIRST_LINK_PATH_TOOL_NAME,
} from './get-first-link-path/tool';

export {
	GET_FIRST_LINK_PATH_TOOL_NAME,
};

export const createLinkTools = (): BuiltinTool[] => [createGetFirstLinkPathTool()];
