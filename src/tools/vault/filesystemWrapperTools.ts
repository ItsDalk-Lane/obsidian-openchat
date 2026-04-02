import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { App } from 'obsidian';
import { registerBuiltinTool } from '../runtime/register-tool';
import { BuiltinToolRegistry } from '../runtime/tool-registry';
import { createListDirectoryFlatTool } from './list-directory-flat/tool';
import { createListDirectoryTreeTool } from './list-directory-tree/tool';
import { createListVaultOverviewTool } from './list-vault-overview/tool';

export function registerFilesystemWrapperTools(
	server: McpServer,
	app: App,
	registry: BuiltinToolRegistry,
): void {
	registerBuiltinTool(server, registry, createListDirectoryTreeTool(app));
	registerBuiltinTool(server, registry, createListDirectoryFlatTool(app));
	registerBuiltinTool(server, registry, createListVaultOverviewTool(app));
}
