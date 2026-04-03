import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { App } from 'obsidian';
import { registerBuiltinTool } from '../runtime/register-tool';
import { BuiltinToolRegistry } from '../runtime/tool-registry';
import { createFindPathsTool } from './find-paths/tool';
import { createQueryIndexTool } from './query-index/tool';
import { createSearchContentTool } from './search-content/tool';
import { createStatPathTool } from './stat-path/tool';

export function registerSearchHandlers(
	server: McpServer,
	app: App,
	registry: BuiltinToolRegistry
): void {
	registerBuiltinTool(server, registry, createFindPathsTool(app));
	registerBuiltinTool(server, registry, createStatPathTool(app));
	registerBuiltinTool(server, registry, createSearchContentTool(app));
	registerBuiltinTool(server, registry, createQueryIndexTool(app));
}
