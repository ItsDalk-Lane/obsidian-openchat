import type { App } from 'obsidian';
import type { BuiltinTool } from '../runtime/types';
import {
	BACKLINK_ANALYZE_TOOL_NAME,
	createBacklinkAnalyzeTool,
} from './backlink-analyze/tool';

export {
	BACKLINK_ANALYZE_TOOL_NAME,
};

export const createGraphTools = (app: App): BuiltinTool[] => [
	createBacklinkAnalyzeTool(app),
];
