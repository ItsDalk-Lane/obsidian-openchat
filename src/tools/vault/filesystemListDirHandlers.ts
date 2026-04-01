import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { App } from 'obsidian';
import { registerBuiltinTool } from '../runtime/register-tool';
import { BuiltinToolRegistry } from '../runtime/tool-registry';
import {
	listDirectorySchema,
	structuredOutputSchema,
	readOnlyToolAnnotations,
	type ListDirectoryArgs,
} from './filesystemToolSchemas';
import { LIST_DIRECTORY_DESCRIPTION } from './filesystemToolDescriptions';
import { executeListDirectory } from './filesystemListDirSupport';

export function registerListDirHandler(
	server: McpServer,
	app: App,
	registry: BuiltinToolRegistry
): void {
	registerBuiltinTool(
		server,
		registry,
		'list_directory',
		{
			title: '列出目录内容',
			description: LIST_DIRECTORY_DESCRIPTION,
			inputSchema: listDirectorySchema,
			outputSchema: structuredOutputSchema,
			annotations: readOnlyToolAnnotations,
		},
		async (input: ListDirectoryArgs) => executeListDirectory(app, input)
	);

}
