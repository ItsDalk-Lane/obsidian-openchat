
import { t } from 'src/i18n/ai-runtime/helper';
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

interface McpServerWithRegisterTool extends McpServer {
	registerTool(
		name: string,
		config: {
			title: string;
			description: string;
			inputSchema: unknown;
			annotations?: unknown;
		},
		handler: (args: Record<string, unknown>) => Promise<unknown>,
	): void;
}

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
			const {
				args: normalizedArgs,
				warning: parseWarning,
			} = parseReadTextFileArgs({
				file_path,
				read_mode,
				start_line,
				line_count,
				response_format,
			});
			const {
				file_path: normalizedFilePath,
				read_mode: normalizedReadMode = 'segment',
				start_line: normalizedStartLine,
				line_count: normalizedLineCount = DEFAULT_READ_SEGMENT_LINES,
				response_format: normalizedResponseFormat = 'json',
			} = normalizedArgs;
			const normalizedPath = normalizeFilePath(normalizedFilePath, 'file_path');
			const file = getFileOrThrow(app, normalizedPath);
			const content = await app.vault.cachedRead(file);
			const basePayload = createReadFilePayload(
				normalizedPath,
				content,
				normalizedReadMode,
				normalizedLineCount,
				normalizedStartLine ?? 1
			) as Record<string, unknown> & {
				content?: string;
				has_more?: boolean;
				next_start_line?: number | null;
				warning?: string | null;
			};
			const payload: typeof basePayload = {
				...basePayload,
				warning: [basePayload.warning, parseWarning].filter(Boolean).join('；') || null,
			};
			return asStructuredOrText(
				normalizedResponseFormat,
				payload,
				(structured) => {
					const typedStructured = structured as typeof payload;
					const parts = [String(typedStructured.content ?? '')];
					if (typedStructured.warning) {
						parts.push(
							t('[Notice] {message}').replace('{message}', String(typedStructured.warning))
						);
					}
					if (typedStructured.has_more && typedStructured.next_start_line) {
						parts.push(
							t('[More content available. Continue from line {line}]')
								.replace('{line}', String(typedStructured.next_start_line))
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
	(server as McpServerWithRegisterTool).registerTool(
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
