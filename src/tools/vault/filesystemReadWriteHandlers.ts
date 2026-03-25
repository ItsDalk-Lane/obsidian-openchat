import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { App, TFile } from 'obsidian';
import { registerBuiltinTool } from '../runtime/register-tool';
import { BuiltinToolRegistry } from '../runtime/tool-registry';
import {
	DEFAULT_READ_SEGMENT_LINES,
	readMediaFileSchema,
	readMultipleFilesSchema,
	readOnlyToolAnnotations,
	readTextFileSchema,
	mutationToolAnnotations,
	structuredOutputSchema,
	writeFileSchema,
	editFileSchema,
	directoryPathSchema,
	type ReadTextFileArgs,
	type ReadMultipleFilesArgs,
} from './filesystemToolSchemas';
import {
	CREATE_DIRECTORY_DESCRIPTION,
	EDIT_FILE_DESCRIPTION,
	READ_FILE_DESCRIPTION,
	READ_FILES_DESCRIPTION,
	READ_MEDIA_DESCRIPTION,
	WRITE_FILE_DESCRIPTION,
} from './filesystemToolDescriptions';
import {
	parseReadMultipleFilesArgs,
	parseReadTextFileArgs,
} from './filesystemToolParsers';
import {
	ensureParentFolderExists,
	ensureFolderExists,
	getFileOrThrow,
} from './helpers';
import {
	normalizeFilePath,
	normalizeDirectoryPath,
	applyEditsToText,
	createReadFilePayload,
	asStructuredOrText,
	type EditOperation,
} from './filesystemToolUtils';
import { getMimeType, toBase64 } from './filesystemFileOps';

const createReadMediaHandler = (app: App) => async (args: unknown) => {
	try {
		const { file_path } = readMediaFileSchema.parse(args);
		const normalizedPath = normalizeFilePath(file_path, 'file_path');
		const file = getFileOrThrow(app, normalizedPath);
		const binary = await app.vault.readBinary(file);
		const mimeType = getMimeType(normalizedPath);
		return {
			content: [
				{
					type: (mimeType.startsWith('image/')
						? 'image'
						: mimeType.startsWith('audio/')
							? 'audio'
							: 'blob') as 'image' | 'audio' | 'blob',
					data: toBase64(binary),
					mimeType,
				},
			],
		};
	} catch (error) {
		return {
			isError: true,
			content: [
				{
					type: 'text' as const,
					text: error instanceof Error ? error.message : String(error),
				},
			],
		};
	}
};


export function registerReadWriteHandlers(
	server: McpServer,
	app: App,
	registry: BuiltinToolRegistry
): void {
	registerBuiltinTool(
		server,
		registry,
		'read_file',
		{
			title: '读取文本文件',
			description: READ_FILE_DESCRIPTION,
			inputSchema: readTextFileSchema,
			outputSchema: structuredOutputSchema,
			annotations: readOnlyToolAnnotations,
		},
		async (input: ReadTextFileArgs) => {
			const {
			file_path,
			read_mode = 'segment',
			start_line,
			line_count = DEFAULT_READ_SEGMENT_LINES,
			response_format = 'json',
			} = input;
			parseReadTextFileArgs({
				file_path,
				read_mode,
				start_line,
				line_count,
				response_format,
			});
			const normalizedPath = normalizeFilePath(file_path, 'file_path');
			const file = getFileOrThrow(app, normalizedPath);
			const content = await app.vault.cachedRead(file);
			const payload = createReadFilePayload(
				normalizedPath,
				content,
				read_mode,
				line_count,
				start_line ?? 1
			);
			return asStructuredOrText(
				response_format,
				payload,
				(structured) => {
					const parts = [String(structured.content ?? '')];
					if (structured.warning) {
						parts.push(`[提示] ${String(structured.warning)}`);
					}
					if (structured.has_more && structured.next_start_line) {
						parts.push(
							`[更多内容可用，下一次从第 ${String(structured.next_start_line)} 行继续读取]`
						);
					}
					return parts.filter(Boolean).join('\n');
				}
			);
		}
	);

	const readMediaHandler = createReadMediaHandler(app);
	registry.register({
		name: 'read_media',
		title: '读取媒体文件',
		description: READ_MEDIA_DESCRIPTION,
		inputSchema: readMediaFileSchema,
		annotations: readOnlyToolAnnotations,
		execute: async (args) => await readMediaHandler(args),
	});
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(server as any).registerTool(
		'read_media',
		{
			title: '读取媒体文件',
			description: READ_MEDIA_DESCRIPTION,
			inputSchema: readMediaFileSchema,
			annotations: readOnlyToolAnnotations,
		},
		async (args: Record<string, unknown>) => await readMediaHandler(args)
	);

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
			parseReadMultipleFilesArgs({
				file_paths,
				read_mode,
				start_line,
				line_count,
				response_format,
			});
				const files = await Promise.all(
					file_paths.map(async (filePath: string) => {
					try {
						const normalizedPath = normalizeFilePath(filePath);
						const file = getFileOrThrow(app, normalizedPath);
						const content = await app.vault.cachedRead(file);
						return {
							...createReadFilePayload(
								normalizedPath,
								content,
								read_mode === 'head' ? 'head' : 'segment',
								line_count,
								start_line ?? 1
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
				response_format,
				{
					files,
					meta: {
						returned: files.length,
						read_mode,
						line_count,
					},
				},
				(structured) =>
					(structured.files as Array<{
						file_path: string;
						content: string;
						error: string | null;
					}>)
						.map((file) =>
							file.error
								? `${file.file_path}: Error - ${file.error}`
								: `${file.file_path}:\n${file.content}`
						)
						.join('\n---\n')
			);
		}
	);

	registerBuiltinTool(
		server,
		registry,
		'write_file',
		{
			title: '写入文本文件',
			description: WRITE_FILE_DESCRIPTION,
			inputSchema: writeFileSchema,
			outputSchema: structuredOutputSchema,
			annotations: mutationToolAnnotations,
		},
		async ({ file_path, content }: { file_path: string; content: string }) => {
			const normalizedPath = normalizeFilePath(file_path, 'file_path');
			await ensureParentFolderExists(app, normalizedPath);
			const existing = app.vault.getAbstractFileByPath(normalizedPath);
			const existed = !!existing;
			if (!existing) {
				await app.vault.create(normalizedPath, content);
			} else if (existing instanceof TFile) {
				await app.vault.modify(existing, content);
			} else {
				throw new Error(`目标不是文件: ${normalizedPath}`);
			}
			return {
				file_path: normalizedPath,
				action: existed ? 'updated' : 'created',
				bytes_written: content.length,
			};
		}
	);

	registerBuiltinTool(
		server,
		registry,
		'edit_file',
		{
			title: '编辑文本文件',
			description: EDIT_FILE_DESCRIPTION,
			inputSchema: editFileSchema,
			outputSchema: structuredOutputSchema,
			annotations: mutationToolAnnotations,
		},
		async ({ file_path, edits, dry_run = false }: { file_path: string; edits: EditOperation[]; dry_run?: boolean }) => {
			const normalizedPath = normalizeFilePath(file_path, 'file_path');
			const file = getFileOrThrow(app, normalizedPath);
			const originalText = await app.vault.cachedRead(file);
			const { diff, modifiedText } = applyEditsToText(
				originalText,
				edits,
				normalizedPath,
				dry_run
			);
			if (!dry_run) {
				await app.vault.modify(file, modifiedText);
			}
			return {
				file_path: normalizedPath,
				dry_run,
				applied_edits: edits.length,
				updated: !dry_run,
				diff,
			};
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
