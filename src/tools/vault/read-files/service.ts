import type { App } from 'obsidian';
import { getFileOrThrow } from '../_shared/helpers';
import { parseReadMultipleFilesArgs } from '../_shared/query';
import { normalizeFilePath } from '../_shared/path';
import { asStructuredOrText, createReadFilePayload } from '../_shared/result';
import {
	DEFAULT_READ_SEGMENT_LINES,
	type ReadMultipleFilesArgs,
} from './schema';

export const summarizeReadFilesTarget = (
	args: Partial<ReadMultipleFilesArgs>,
): string | null => {
	const count = args.file_paths?.length ?? 0;
	return count > 0 ? `${count} files` : null;
};

export const executeReadFiles = async (
	app: App,
	input: ReadMultipleFilesArgs,
): Promise<unknown> => {
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
				const normalizedPath = normalizeFilePath(filePath, 'file_paths');
				const file = getFileOrThrow(app, normalizedPath);
				const content = await app.vault.cachedRead(file);
				return {
					...createReadFilePayload(
						normalizedPath,
						content,
						normalizedReadMode === 'head' ? 'head' : 'segment',
						normalizedLineCount,
						normalizedStartLine ?? 1,
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
		}),
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
							: `${file.file_path}:\n${file.content}`,
					),
			]
				.filter(Boolean)
				.join('\n---\n'),
	);
};