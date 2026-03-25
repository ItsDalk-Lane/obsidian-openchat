import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { App, TFile, TFolder } from 'obsidian';
import { registerBuiltinTool } from '../runtime/register-tool';
import { BuiltinToolRegistry } from '../runtime/tool-registry';
import { toCanonicalJsonText } from '../runtime/tool-result';
import {
	mutationToolAnnotations,
	readOnlyToolAnnotations,
	structuredOutputSchema,
	type QueryIndexArgs,
	queryIndexSchema,
	moveFileSchema,
	findPathsSchema,
	deleteFileSchema,
	searchContentSchema,
	getFileInfoSchema,
} from './filesystemToolSchemas';
import { DEFAULT_SEARCH_MAX_RESULTS } from '../runtime/constants';
import {
	DELETE_PATH_DESCRIPTION,
	FIND_PATHS_DESCRIPTION,
	MOVE_PATH_DESCRIPTION,
	QUERY_INDEX_DESCRIPTION,
	SEARCH_CONTENT_DESCRIPTION,
	STAT_PATH_DESCRIPTION,
} from './filesystemToolDescriptions';
import { parseQueryIndexArgs } from './filesystemToolParsers';
import {
	ensureFolderExists,
	getAbstractFileOrThrow,
	getFolderOrThrow,
	getFileStat,
	normalizeVaultPath,
	assertVaultPath,
} from './helpers';
import { buildQueryIndexExpression } from './filesystemQueryIndex';
import { registerNavTools } from './nav-tools';
import {
	normalizeFilePath,
	normalizeDirectoryPath,
	formatLocal,
	isPathUnderDirectory,
	toRelativeChildPath,
	createContentSearchRegex,
	normalizeFileTypeFilters,
	normalizeLineEndings,
	createContextEntries,
	asStructuredOrText,
	type ContentSearchMatch,
	type PathSearchMatch,
} from './filesystemToolUtils';
import {
	collectDescendants,
	getPathSearchMatchMeta,
	shouldSkipContentSearchFile,
	toQueryIndexResponse,
} from './filesystemFileOps';
import { executeVaultQuery } from './vault-query';
import { localInstance } from 'src/i18n/locals';

export function registerSearchHandlers(
	server: McpServer,
	app: App,
	registry: BuiltinToolRegistry
): void {
	registerBuiltinTool(
		server,
		registry,
		'move_path',
		{
			title: '移动或重命名路径',
			description: MOVE_PATH_DESCRIPTION,
			inputSchema: moveFileSchema,
			outputSchema: structuredOutputSchema,
			annotations: mutationToolAnnotations,
		},
		async ({ source_path, destination_path }: { source_path: string; destination_path: string }) => {
			const normalizedSource = normalizeFilePath(source_path, 'source_path');
			const normalizedDestination = normalizeFilePath(destination_path, 'destination_path');
			const from = getAbstractFileOrThrow(app, normalizedSource);
			if (app.vault.getAbstractFileByPath(normalizedDestination)) {
				throw new Error(`目标路径已存在: ${normalizedDestination}`);
			}
			const destinationParent = normalizedDestination.includes('/')
				? normalizedDestination.slice(0, normalizedDestination.lastIndexOf('/'))
				: '';
			await ensureFolderExists(app, destinationParent);
			await app.vault.rename(from, normalizedDestination);
			return {
				source_path: normalizedSource,
				destination_path: normalizedDestination,
				moved: true,
			};
		}
	);

	registerBuiltinTool(
		server,
		registry,
		'find_paths',
		{
			title: '按名称发现路径',
			description: FIND_PATHS_DESCRIPTION,
			inputSchema: findPathsSchema,
			outputSchema: structuredOutputSchema,
			annotations: readOnlyToolAnnotations,
		},
		async ({
			query,
			scope_path = '/',
			target_type = 'any',
			match_mode = 'contains',
			max_results = 100,
			response_format = 'json',
		}: { query: string; scope_path?: string; target_type?: 'any' | 'file' | 'directory'; match_mode?: 'contains' | 'prefix' | 'suffix' | 'exact' | 'glob'; max_results?: number; response_format?: 'json' | 'text' }) => {
			const normalizedScopePath = normalizeDirectoryPath(scope_path, 'scope_path');
			const folder = getFolderOrThrow(app, normalizedScopePath);
			const matches = collectDescendants(folder)
				.filter((child) => {
					if (target_type === 'file' && !(child instanceof TFile)) {
						return false;
					}
					if (target_type === 'directory' && !(child instanceof TFolder)) {
						return false;
					}
					return true;
				})
				.map((child) => {
					const relativePath = toRelativeChildPath(normalizedScopePath, child.path);
					const meta = getPathSearchMatchMeta(
						query,
						match_mode,
						child.name,
						relativePath
					);
					if (!meta) return null;
					return {
						path: child.path,
						name: child.name,
						type: child instanceof TFolder ? 'directory' : 'file',
						matched_on: meta.matched_on,
						score: meta.score,
					};
				})
				.filter((entry): entry is PathSearchMatch & { score: number } => entry !== null)
				.sort((a, b) => a.score - b.score || a.path.localeCompare(b.path));

			const limitedMatches = matches.slice(0, max_results).map(({ score, ...entry }) => entry);
			return asStructuredOrText(
				response_format,
				{
					query,
					scope_path: normalizedScopePath || '/',
					target_type,
					match_mode,
					matches: limitedMatches,
					meta: {
						total_before_limit: matches.length,
						returned: limitedMatches.length,
						max_results,
						truncated: limitedMatches.length < matches.length,
					},
				},
				(structured) => {
					const textMatches = structured.matches as PathSearchMatch[];
					const meta = structured.meta as { truncated: boolean; max_results: number };
					if (textMatches.length === 0) {
						return 'No path matches found';
					}
					return [
						...textMatches.map((entry) =>
							`${entry.type === 'directory' ? '[DIR]' : '[FILE]'} ${entry.path}`
						),
						...(meta.truncated
							? [formatLocal(localInstance.mcp_fs_search_files_truncated, meta.max_results)]
							: []),
					].join('\n');
				}
			);
		}
	);

	registerBuiltinTool(
		server,
		registry,
		'delete_path',
		{
			title: '删除路径',
			description: DELETE_PATH_DESCRIPTION,
			inputSchema: deleteFileSchema,
			outputSchema: structuredOutputSchema,
			annotations: mutationToolAnnotations,
		},
		async ({ target_path, force = true }: { target_path: string; force?: boolean }) => {
			const normalizedPath = normalizeVaultPath(target_path);
			if (!normalizedPath) {
				throw new Error(localInstance.mcp_fs_delete_root_forbidden);
			}
			assertVaultPath(normalizedPath, 'target_path');
			const target = app.vault.getAbstractFileByPath(normalizedPath);
			if (!target) {
				return {
					target_path: normalizedPath,
					existed: false,
					deleted: false,
				};
			}
			await app.vault.delete(target, force);
			return {
				target_path: normalizedPath,
				existed: true,
				deleted: true,
			};
		}
	);

	registerBuiltinTool(
		server,
		registry,
		'search_content',
		{
			title: '搜索文件内容',
			description: SEARCH_CONTENT_DESCRIPTION,
			inputSchema: searchContentSchema,
			outputSchema: structuredOutputSchema,
			annotations: readOnlyToolAnnotations,
		},
		async ({
			pattern,
			match_mode = 'literal',
			scope_path = '/',
			file_types = [],
			max_results = DEFAULT_SEARCH_MAX_RESULTS,
			case_sensitive = false,
			context_lines = 0,
			response_format = 'json',
			}: { pattern: string; match_mode?: 'literal' | 'regex'; scope_path?: string; file_types?: string[]; max_results?: number; case_sensitive?: boolean; context_lines?: number; response_format?: 'json' | 'text' }) => {
				const normalizedScopePath = normalizeDirectoryPath(scope_path, 'scope_path');
				if (normalizedScopePath) {
					getFolderOrThrow(app, normalizedScopePath);
				}
				const regex = createContentSearchRegex(pattern, match_mode, case_sensitive);
			const allowedExtensions = normalizeFileTypeFilters(file_types);
			const matches: ContentSearchMatch[] = [];
			const skippedFiles: Array<{ path: string; reason: string }> = [];
			let scannedFiles = 0;
			const buildResponse = (truncated: boolean) =>
				asStructuredOrText(
					response_format,
					{
						matches,
						meta: {
							scope_path: normalizedScopePath || '/',
							match_mode,
							file_types: allowedExtensions ?? [],
							max_results,
							case_sensitive,
							context_lines,
							scanned_files: scannedFiles,
							skipped_files: skippedFiles,
							returned: matches.length,
							has_more: truncated,
							truncated,
						},
					},
					(structured) => {
						const textMatches = structured.matches as ContentSearchMatch[];
						const meta = structured.meta as { truncated: boolean };
						if (textMatches.length === 0) {
							return 'No content matches found';
						}
						return [
							...textMatches.flatMap((match) => {
								const lines = [`${match.path}:${match.line}: ${match.text}`];
								for (const before of match.before) {
									lines.push(`  ${before.line}- ${before.text}`);
								}
								for (const after of match.after) {
									lines.push(`  ${after.line}+ ${after.text}`);
								}
								return lines;
							}),
							...(meta.truncated
								? ['[结果已截断，请缩小搜索范围或降低 max_results]']
								: []),
						].join('\n');
					}
				);

			for (const file of app.vault.getFiles()) {
				if (!isPathUnderDirectory(normalizedScopePath, file.path)) {
					continue;
				}
				const skipReason = shouldSkipContentSearchFile(file, allowedExtensions);
				if (skipReason) {
					if (skipReason !== 'filtered') {
						skippedFiles.push({
							path: file.path,
							reason: skipReason,
						});
					}
					continue;
				}

				const content = await app.vault.cachedRead(file);
				scannedFiles += 1;
				const lines = normalizeLineEndings(content).split('\n');
				for (let index = 0; index < lines.length; index += 1) {
					if (!regex.test(lines[index])) {
						continue;
					}
					matches.push({
						path: file.path,
						line: index + 1,
						text: lines[index],
						before: createContextEntries(
							lines,
							index - context_lines,
							index - 1
						),
						after: createContextEntries(
							lines,
							index + 1,
							index + context_lines
						),
					});
					if (matches.length >= max_results) {
						return buildResponse(true);
					}
				}
			}

			return buildResponse(false);
		}
	);

	registerBuiltinTool(
		server,
		registry,
		'query_index',
		{
			title: '查询结构化索引',
			description: QUERY_INDEX_DESCRIPTION,
			inputSchema: queryIndexSchema,
			outputSchema: structuredOutputSchema,
			annotations: readOnlyToolAnnotations,
		},
		async (args: QueryIndexArgs) => {
			const parsedArgs = parseQueryIndexArgs(args);
			const expression = buildQueryIndexExpression(parsedArgs);
			const result = toQueryIndexResponse(await executeVaultQuery(app, expression));
			return asStructuredOrText(
				parsedArgs.response_format ?? 'json',
				result,
				(structured) => toCanonicalJsonText(structured)
			);
		}
	);

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
		async ({ target_path, response_format = 'json' }: { target_path: string; response_format?: 'json' | 'text' }) => {
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

	registerNavTools(server, app, registry);
}
