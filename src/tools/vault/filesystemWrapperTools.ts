import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { App } from 'obsidian';
import { registerBuiltinTool } from '../runtime/register-tool';
import { BuiltinToolRegistry } from '../runtime/tool-registry';
import {
	readOnlyToolAnnotations,
	structuredOutputSchema,
} from './filesystemToolSchemas';
import { executeListDirectory } from './filesystemListDirSupport';
import {
	buildListDirectoryFlatArgs,
	buildListDirectoryTreeArgs,
	buildListVaultOverviewArgs,
	listDirectoryFlatSchema,
	listDirectoryTreeSchema,
	listVaultOverviewSchema,
	type ListDirectoryFlatArgs,
	type ListDirectoryTreeArgs,
	type ListVaultOverviewArgs,
} from './filesystemWrapperSupport';

export function registerFilesystemWrapperTools(
	server: McpServer,
	app: App,
	registry: BuiltinToolRegistry,
): void {
	registerBuiltinTool(
		server,
		registry,
		'list_directory_tree',
		{
			title: '树形列出目录',
			description: '以树形结构递归浏览已知目录。',
			inputSchema: listDirectoryTreeSchema,
			outputSchema: structuredOutputSchema,
			annotations: readOnlyToolAnnotations,
		},
		async (input: ListDirectoryTreeArgs) =>
			executeListDirectory(app, buildListDirectoryTreeArgs(input)),
	);

		registerBuiltinTool(
			server,
			registry,
			'list_directory_flat',
			{
				title: '列出当前目录一层内容',
				description: '浏览一个已知目录的一层内容。',
				inputSchema: listDirectoryFlatSchema,
				outputSchema: structuredOutputSchema,
				annotations: readOnlyToolAnnotations,
			},
			async (input: ListDirectoryFlatArgs) =>
				executeListDirectory(app, buildListDirectoryFlatArgs(input)),
		);

	registerBuiltinTool(
		server,
		registry,
		'list_vault_overview',
		{
			title: '获取 Vault 总览',
			description: '获取整个 Vault 的轻量文件路径总览。',
			inputSchema: listVaultOverviewSchema,
			outputSchema: structuredOutputSchema,
			annotations: readOnlyToolAnnotations,
		},
		async (input: ListVaultOverviewArgs) =>
			executeListDirectory(app, buildListVaultOverviewArgs(input)),
	);
}