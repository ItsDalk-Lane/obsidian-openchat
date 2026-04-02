import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { App, TFile, TFolder } from 'obsidian';
import { registerBuiltinTool } from '../runtime/register-tool';
import { BuiltinToolRegistry } from '../runtime/tool-registry';
import {
	readOnlyToolAnnotations,
	structuredOutputSchema,
	getFileInfoSchema,
} from './filesystemToolSchemas';
import {
	STAT_PATH_DESCRIPTION,
} from './filesystemToolDescriptions';
import {
	getAbstractFileOrThrow,
	getFileStat,
} from './helpers';
import {
	normalizeDirectoryPath,
	asStructuredOrText,
} from './filesystemToolUtils';
import { createDeletePathTool } from './delete-path/tool';
import { createFindPathsTool } from './find-paths/tool';
import { createMovePathTool } from './move-path/tool';
import { createQueryIndexTool } from './query-index/tool';
import { createSearchContentTool } from './search-content/tool';

export function registerSearchHandlers(
	server: McpServer,
	app: App,
	registry: BuiltinToolRegistry
): void {
	registerBuiltinTool(server, registry, createMovePathTool(app));
	registerBuiltinTool(server, registry, createFindPathsTool(app));
	registerBuiltinTool(server, registry, createDeletePathTool(app));
	registerBuiltinTool(server, registry, createSearchContentTool(app));
	registerBuiltinTool(server, registry, createQueryIndexTool(app));

	registerBuiltinTool(
		server,
		registry,
		'stat_path',
		{
			title: '读取文件元信息',
			description: STAT_PATH_DESCRIPTION,
				inputSchema: getFileInfoSchema,
				outputSchema: structuredOutputSchema,
				annotations: readOnlyToolAnnotations,
			},
			async (
				{ target_path, response_format = 'json' }: {
					target_path: string;
					response_format?: 'json' | 'text';
				},
			) => {
				const normalizedPath = normalizeDirectoryPath(target_path, 'target_path');
				const target = normalizedPath
					? getAbstractFileOrThrow(app, normalizedPath)
				: app.vault.getRoot();
			const adapterStat = normalizedPath
				? await app.vault.adapter.stat(normalizedPath)
				: null;
			const fileStat = target instanceof TFile ? getFileStat(target) : null;
			return asStructuredOrText(
				response_format,
				{
					target_path: normalizedPath || '/',
					type: target instanceof TFolder ? 'directory' : 'file',
					size: fileStat?.size ?? adapterStat?.size ?? 0,
					created: fileStat?.ctime ?? adapterStat?.ctime ?? null,
					modified: fileStat?.mtime ?? adapterStat?.mtime ?? null,
					accessed: null,
					permissions: 'N/A',
				},
				(structured) =>
					Object.entries(structured)
						.map(([key, value]) => `${key}: ${value}`)
						.join('\n')
			);
		}
	);

}
