import type { App } from 'obsidian';
import { t } from 'src/i18n/ai-runtime/helper';
import { getFileOrThrow } from '../_shared/helpers';
import { normalizeFilePath } from '../_shared/path';
import { parseReadTextFileArgs } from '../_shared/query';
import { asStructuredOrText, createReadFilePayload } from '../_shared/result';
import {
	DEFAULT_READ_SEGMENT_LINES,
	type ReadFileArgs,
} from './schema';

type ReadFilePayload = Record<string, unknown> & {
	content?: string;
	has_more?: boolean;
	next_start_line?: number | null;
	warning?: string | null;
};

export const executeReadFile = async (
	app: App,
	input: ReadFileArgs,
): Promise<ReadFilePayload | string> => {
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
		normalizedStartLine ?? 1,
	) as ReadFilePayload;
	const payload: ReadFilePayload = {
		...basePayload,
		warning: [basePayload.warning, parseWarning].filter(Boolean).join('；') || null,
	};
	return asStructuredOrText(
		normalizedResponseFormat,
		payload,
		(structured) => {
			const parts = [String(structured.content ?? '')];
			if (structured.warning) {
				parts.push(
					t('[Notice] {message}').replace('{message}', String(structured.warning)),
				);
			}
			if (structured.has_more && structured.next_start_line) {
				parts.push(
					t('[More content available. Continue from line {line}]')
						.replace('{line}', String(structured.next_start_line)),
				);
			}
			return parts.filter(Boolean).join('\n');
		},
	);
};
