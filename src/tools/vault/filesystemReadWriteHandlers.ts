import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { App } from 'obsidian';
import { registerBuiltinTool } from '../runtime/register-tool';
import { BuiltinToolRegistry } from '../runtime/tool-registry';
import {
	DEFAULT_READ_SEGMENT_LINES,
	readMultipleFilesSchema,
	readOnlyToolAnnotations,
	mutationToolAnnotations,
	structuredOutputSchema,
	directoryPathSchema,
	type ReadMultipleFilesArgs,
} from './filesystemToolSchemas';
import {
	CREATE_DIRECTORY_DESCRIPTION,
	READ_FILES_DESCRIPTION,
} from './filesystemToolDescriptions';
import {
	parseReadMultipleFilesArgs,
} from './filesystemToolParsers';
import {
	ensureFolderExists,
	getFileOrThrow,
} from './helpers';
import {
	normalizeFilePath,
	normalizeDirectoryPath,
	createReadFilePayload,
	asStructuredOrText,
} from './filesystemToolUtils';
import { createEditFileTool } from './edit-file/tool';
import { createAppendDailyNoteTool } from './append-daily-note/tool';
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

	registerBuiltinTool(
		server,
		registry,
		'read_files',
		{
			title: '批量读取文本文件',
			description: READ_FILES_DESCRIPTION,
			inputSchema: readMultipleFilesSchema,
			outputSchema: structuredOutputSchema,
			annotations: readOnlyToolAnnotations,
		},
		async (input: ReadMultipleFilesArgs) => {
			const {
				file_paths,
				read_mode = 'segment',
				start_line,
				line_count = Math.min(80, DEFAULT_READ_SEGMENT_LINES),
				response_format = 'json',
			} = input;
			const {
				args: normalizedArgs,
				warning: parseWarning,
			} = parseReadMultipleFilesArgs({
				file_paths,
				read_mode,
				start_line,
				line_count,
				response_format,
			});
			const {
				file_paths: normalizedFilePaths,
				read_mode: normalizedReadMode = 'segment',
				start_line: normalizedStartLine,
				line_count: normalizedLineCount = Math.min(80, DEFAULT_READ_SEGMENT_LINES),
				response_format: normalizedResponseFormat = 'json',
			} = normalizedArgs;
			const files = await Promise.all(
				normalizedFilePaths.map(async (filePath: string) => {
					try {
						const normalizedPath = normalizeFilePath(filePath);
						const file = getFileOrThrow(app, normalizedPath);
						const content = await app.vault.cachedRead(file);
						return {
							...createReadFilePayload(
								normalizedPath,
								content,
								normalizedReadMode === 'head' ? 'head' : 'segment',
								normalizedLineCount,
								normalizedStartLine ?? 1
							),
							error: null,
						};
					} catch (error) {
						return {
							file_path: filePath,
							content: '',
							read_mode,
							total_lines: null,
							returned_start_line: null,
							returned_end_line: null,
							has_more: false,
							next_start_line: null,
							truncated: false,
							warning: null,
							suggested_next_call: null,
							error: error instanceof Error ? error.message : String(error),
						};
					}
				})
			);
			return asStructuredOrText(
				normalizedResponseFormat,
				{
					files,
					meta: {
						returned: files.length,
						read_mode: normalizedReadMode,
						line_count: normalizedLineCount,
						warning: parseWarning,
					},
				},
				(structured) =>
					[
						typeof structured.meta?.warning === 'string' && structured.meta.warning
							? `[提示] ${structured.meta.warning}`
							: '',
						...(structured.files as Array<{
							file_path: string;
							content: string;
							error: string | null;
						}>)
							.map((file) =>
								file.error
									? `${file.file_path}: Error - ${file.error}`
									: `${file.file_path}:\n${file.content}`
							),
					]
						.filter(Boolean)
						.join('\n---\n')
			);
		}
	);

	registerBuiltinTool(
		server,
		registry,
		'create_directory',
		{
			title: '创建目录',
			description: CREATE_DIRECTORY_DESCRIPTION,
			inputSchema: directoryPathSchema,
			outputSchema: structuredOutputSchema,
			annotations: mutationToolAnnotations,
		},
		async ({ directory_path }: { directory_path: string }) => {
			const normalizedPath = normalizeDirectoryPath(directory_path, 'directory_path');
			const existed = !!app.vault.getAbstractFileByPath(normalizedPath);
			await ensureFolderExists(app, normalizedPath);
			return {
				directory_path: normalizedPath || '/',
				created: !existed,
				existed,
			};
		}
	);
}
