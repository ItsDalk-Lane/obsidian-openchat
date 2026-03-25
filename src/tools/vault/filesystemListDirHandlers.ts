import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { App, TFile, TFolder } from 'obsidian';
import { registerBuiltinTool } from '../runtime/register-tool';
import { BuiltinToolRegistry } from '../runtime/tool-registry';
import { toCanonicalJsonText } from '../runtime/tool-result';
import {
	listDirectorySchema,
	structuredOutputSchema,
	readOnlyToolAnnotations,
	type ListDirectoryArgs,
} from './filesystemToolSchemas';
import { LIST_DIRECTORY_DESCRIPTION } from './filesystemToolDescriptions';
import { parseListDirectoryArgs } from './filesystemToolParsers';
import {
	getFolderOrThrow,
	resolveRegex,
	getFileStat,
} from './helpers';
import {
	normalizeDirectoryPath,
	asStructuredOrText,
	formatSize,
	normalizeFileTypeFilters,
} from './filesystemToolUtils';
import { buildDirectoryTree, collectVaultFilePaths } from './filesystemFileOps';

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
		async (input: ListDirectoryArgs) => {
			const {
			directory_path = '/',
			view = 'flat',
			include_sizes = false,
			sort_by = 'name',
			regex,
			exclude_patterns = [],
			limit = 100,
			offset = 0,
			max_depth = 5,
			max_nodes = 200,
			file_extensions = [],
			vault_limit = 1_000,
			response_format = 'json',
			} = input;
			parseListDirectoryArgs({
				directory_path,
				view,
				include_sizes,
				sort_by,
				regex,
				exclude_patterns,
				limit,
				offset,
				max_depth,
				max_nodes,
				file_extensions,
				vault_limit,
				response_format,
			}, normalizeDirectoryPath);
			if (view === 'vault') {
				const normalizedExtensions = normalizeFileTypeFilters(file_extensions);
				const allPaths = collectVaultFilePaths(app, normalizedExtensions);
				const paths = allPaths.slice(0, vault_limit);
				const payload = {
					directory_path: '/',
					view,
					paths,
					meta: {
						returned: paths.length,
						truncated: allPaths.length > vault_limit,
						file_extensions: normalizedExtensions ?? [],
						vault_limit,
						total_before_limit: allPaths.length,
					},
				};
				return asStructuredOrText(
					response_format,
					payload,
					(structured) => {
						const textPaths = structured.paths as string[];
						const meta = structured.meta as {
							truncated: boolean;
							total_before_limit: number;
						};
						return [
							...textPaths,
							...(meta.truncated
								? [`[结果已截断，共有 ${meta.total_before_limit} 个文件，请调整 file_extensions 过滤条件或增大 vault_limit]`]
								: []),
						].join('\n');
					}
				);
			}

			const normalizedPath = normalizeDirectoryPath(directory_path, 'directory_path');
			const folder = getFolderOrThrow(app, normalizedPath);
			if (view === 'tree') {
				const state = { nodes: 0, truncated: false };
				const tree = buildDirectoryTree(
					folder,
					normalizedPath,
					exclude_patterns,
					max_depth,
					max_nodes,
					state
				);
				return asStructuredOrText(
					response_format,
					{
						directory_path: normalizedPath || '/',
						view,
						tree,
						meta: {
							max_depth,
							max_nodes,
							returned_nodes: state.nodes,
							truncated: state.truncated,
						},
					},
					(structured) => toCanonicalJsonText(structured)
				);
			}

			const pattern = resolveRegex(regex);
			const entries = folder.children
				.filter((child) => !pattern || pattern.test(child.name))
				.map((child) => ({
					name: child.name,
					type: child instanceof TFolder ? 'directory' : 'file',
					path: child.path,
					size: child instanceof TFile ? getFileStat(child).size : 0,
				}));

			const sortedEntries = [...entries].sort((a, b) => {
				if (sort_by === 'size') {
					return b.size - a.size;
				}
				return a.name.localeCompare(b.name);
			});
			const pagedEntries = sortedEntries.slice(offset, offset + limit);
			const basePayload = {
				directory_path: normalizedPath || '/',
				view,
				items: pagedEntries.map((entry) => ({
					name: entry.name,
					type: entry.type,
					path: entry.path,
					...(include_sizes
						? {
							size: entry.size,
							sizeText:
								entry.type === 'directory' ? null : formatSize(entry.size),
						}
						: {}),
				})),
				meta: {
					total_before_limit: sortedEntries.length,
					returned: pagedEntries.length,
					offset,
					limit,
					truncated: offset + pagedEntries.length < sortedEntries.length,
					regex: regex ?? null,
				},
			};

			if (!include_sizes) {
				return asStructuredOrText(
					response_format,
					basePayload,
					(structured) => {
						const textItems = structured.items as Array<{
							name: string;
							type: string;
						}>;
						const meta = structured.meta as { truncated: boolean };
						return [
							...textItems.map((item) =>
								`${item.type === 'directory' ? '[DIR]' : '[FILE]'} ${item.name}`
							),
							...(meta.truncated
								? ['[结果已截断，请增大 limit 或调整 offset]']
								: []),
						].join('\n');
					}
				);
			}

			const totalFiles = entries.filter((entry) => entry.type === 'file').length;
			const totalDirs = entries.filter((entry) => entry.type === 'directory').length;
			const totalSize = entries.reduce((sum, entry) => sum + (entry.type === 'file' ? entry.size : 0), 0);
			return asStructuredOrText(
				response_format,
				{
					...basePayload,
					summary: {
						total_files: totalFiles,
						total_directories: totalDirs,
						total_size: totalSize,
						total_size_text: formatSize(totalSize),
					},
				},
				(structured) => {
					const items = structured.items as Array<{
						name: string;
						type: string;
						sizeText: string | null;
					}>;
					const summary = structured.summary as {
						total_files: number;
						total_directories: number;
						total_size_text: string;
					};
					const meta = structured.meta as { truncated: boolean };
					return [
						...items.map((entry) =>
							`${entry.type === 'directory' ? '[DIR]' : '[FILE]'} ${entry.name.padEnd(30)} ${
								entry.type === 'directory' ? '' : String(entry.sizeText ?? '').padStart(10)
							}`.trimEnd()
						),
						'',
						`Total: ${summary.total_files} files, ${summary.total_directories} directories`,
						`Combined size: ${summary.total_size_text}`,
						...(meta.truncated
							? ['[结果已截断，请增大 limit 或调整 offset]']
							: []),
					].join('\n');
				}
			);
		}
	);

}
