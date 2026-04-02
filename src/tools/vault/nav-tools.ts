import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { App } from 'obsidian';
import { registerBuiltinTool } from '../runtime/register-tool';
import { BuiltinToolRegistry } from '../runtime/tool-registry';
import type { BuiltinTool } from '../runtime/types';
import { createOpenFileTool } from './open-file/tool';

export function createNavTools(app: App): BuiltinTool[] {
	return [createOpenFileTool(app)];
}

export function registerNavTools(
	server: McpServer,
	app: App,
	registry: BuiltinToolRegistry
): void {
	registerBuiltinTool(server, registry, createOpenFileTool(app));
}
