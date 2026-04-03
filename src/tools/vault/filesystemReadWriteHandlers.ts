import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { App } from 'obsidian';
import { registerBuiltinTool } from '../runtime/register-tool';
import { BuiltinToolRegistry } from '../runtime/tool-registry';
import {
} from './filesystemToolSchemas';
import { createEditFileTool } from './edit-file/tool';
import { createAppendDailyNoteTool } from './append-daily-note/tool';
import { createCreateDirectoryTool } from './create-directory/tool';
import { createDeletePathTool } from './delete-path/tool';
import { createMovePathTool } from './move-path/tool';
import { createReadFilesTool } from './read-files/tool';
import { createPropertyEditTool } from './property-edit/tool';
import { createReadFileTool } from './read-file/tool';
import { createReadMediaTool } from './read-media/tool';
import { createWriteFileTool } from './write-file/tool';

export function registerReadWriteHandlers(
	server: McpServer,
	app: App,
	registry: BuiltinToolRegistry
): void {
	registerBuiltinTool(server, registry, createReadFileTool(app));
	registerBuiltinTool(server, registry, createReadMediaTool(app));
	registerBuiltinTool(server, registry, createWriteFileTool(app));
	registerBuiltinTool(server, registry, createEditFileTool(app));
	registerBuiltinTool(server, registry, createAppendDailyNoteTool(app));
	registerBuiltinTool(server, registry, createPropertyEditTool(app));
	registerBuiltinTool(server, registry, createReadFilesTool(app));
	registerBuiltinTool(server, registry, createCreateDirectoryTool(app));
	registerBuiltinTool(server, registry, createMovePathTool(app));
	registerBuiltinTool(server, registry, createDeletePathTool(app));
}
