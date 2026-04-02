import type { App } from 'obsidian';
import type { BuiltinTool } from '../runtime/types';
import { ScriptRuntime } from '../runtime/script-runtime';
import {
	createRunScriptTool,
	RUN_SCRIPT_TOOL_NAME,
} from './run-script/tool';
import {
	createRunShellTool,
	RUN_SHELL_TOOL_NAME,
} from './run-shell/tool';

export {
	RUN_SCRIPT_TOOL_NAME,
	RUN_SHELL_TOOL_NAME,
};

export const createScriptTools = (
	app: App,
	scriptRuntime: ScriptRuntime,
): BuiltinTool[] => [
	createRunScriptTool(scriptRuntime),
	createRunShellTool(app),
];
