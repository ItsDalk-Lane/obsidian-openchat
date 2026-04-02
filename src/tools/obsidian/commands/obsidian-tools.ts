import type { App } from 'obsidian';
import type { BuiltinTool } from '../../runtime/types';
import {
	createListCommandsTool,
	LIST_COMMANDS_TOOL_NAME,
} from './list-commands/tool';
import {
	createRunCommandTool,
	RUN_COMMAND_TOOL_NAME,
} from './run-command/tool';

export {
	LIST_COMMANDS_TOOL_NAME,
	RUN_COMMAND_TOOL_NAME,
};

export const createObsidianCommandTools = (app: App): BuiltinTool[] => [
	createListCommandsTool(app),
	createRunCommandTool(app),
];
