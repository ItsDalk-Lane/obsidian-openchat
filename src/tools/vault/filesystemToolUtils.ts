import { localInstance } from 'src/i18n/locals';
import { createTwoFilesPatch } from 'diff';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { minimatch } from 'minimatch';
import {
	assertVaultPath,
	assertVaultPathOrRoot,
	normalizeVaultPath,
} from './helpers';
import { toCanonicalJsonText } from '../runtime/tool-result';
import { DEFAULT_TEXT_FILE_MAX_CHARS } from '../runtime/constants';
import { DEFAULT_READ_SEGMENT_LINES } from './filesystemToolSchemas';

export interface FilesystemEntry {
	name: string;
	type: 'file' | 'directory';
	children?: FilesystemEntry[];
}

export interface EditOperation {
	oldText: string;
	newText: string;
}

export interface ContentSearchContextEntry {
	line: number;
	text: string;
}

export interface ContentSearchMatch {
	path: string;
	line: number;
	text: string;
	before: ContentSearchContextEntry[];
	after: ContentSearchContextEntry[];
}

export interface PathSearchMatch {
	path: string;
	name: string;
	type: 'file' | 'directory';
	matched_on: 'name' | 'path';
}

export type BuiltinResponseFormat = 'json' | 'text';
export type ReadMode = 'full' | 'segment' | 'head' | 'tail';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type BatchReadMode = 'segment' | 'head';
export const mimeTypes: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	bmp: 'image/bmp',
	svg: 'image/svg+xml',
	mp3: 'audio/mpeg',
	wav: 'audio/wav',
	ogg: 'audio/ogg',
	flac: 'audio/flac',
	m4a: 'audio/mp4',
};

export const normalizeDirectoryPath = (input: string, fieldName = 'path'): string => {
	const normalized = normalizeVaultPath(input);
	assertVaultPathOrRoot(normalized, fieldName);
	return normalized;
};

export const normalizeFilePath = (input: string, fieldName = 'path'): string => {
	const normalized = normalizeVaultPath(input);
	assertVaultPath(normalized, fieldName);
	return normalized;
};

export const toRelativeChildPath = (basePath: string, childPath: string): string => {
	if (!basePath) return childPath;
	return childPath.startsWith(`${basePath}/`)
		? childPath.slice(basePath.length + 1)
		: childPath;
};

export const formatSize = (bytes: number): string => {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	if (!Number.isFinite(bytes) || bytes <= 0) {
		return '0 B';
	}
	const unitIndex = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		units.length - 1
	);
	if (unitIndex <= 0) {
		return `${bytes} B`;
	}
	return `${(bytes / Math.pow(1024, unitIndex)).toFixed(2)} ${units[unitIndex]}`;
};

export const normalizeLineEndings = (text: string): string => text.replace(/\r\n/g, '\n');

export const MAX_CONTENT_SEARCH_FILE_SIZE_BYTES = 2 * 1024 * 1024;

export const binaryFileExtensions = new Set([
	'png',
	'jpg',
	'jpeg',
	'gif',
	'webp',
	'bmp',
	'svg',
	'ico',
	'mp3',
	'wav',
	'ogg',
	'flac',
	'm4a',
	'mp4',
	'mov',
	'avi',
	'pdf',
	'zip',
	'gz',
	'tar',
	'7z',
	'rar',
	'exe',
	'dll',
	'so',
	'bin',
	'woff',
	'woff2',
	'ttf',
	'eot',
]);

export const formatLocal = (template: string, ...values: Array<string | number>): string => {
	return values.reduce<string>((text, value, index) => {
		return text.replace(new RegExp(`\\{${index}\\}`, 'g'), String(value));
	}, template);
};

export const normalizeFileTypeFilters = (fileTypes?: string[]): string[] | null => {
	const rawValues = fileTypes ?? [];
	if (rawValues.length === 0) {
		return null;
	}
	const normalized = rawValues.map((part) =>
		String(part ?? '').trim().replace(/^\./, '').toLowerCase()
	);
	if (normalized.some((part) => !part)) {
		throw new Error(localInstance.mcp_fs_search_content_invalid_file_type);
	}
	return Array.from(new Set(normalized));
};

export const createContentSearchRegex = (
	pattern: string,
	matchMode: 'literal' | 'regex',
	caseSensitive: boolean
): RegExp => {
	const normalizedPattern =
		matchMode === 'literal'
			? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
			: pattern;
	try {
		return new RegExp(normalizedPattern, caseSensitive ? '' : 'i');
	} catch (error) {
		throw new Error(
			`非法正则表达式: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}
};

export const isPathUnderDirectory = (rootPath: string, targetPath: string): boolean => {
	if (!rootPath) {
		return true;
	}
	return targetPath === rootPath || targetPath.startsWith(`${rootPath}/`);
};

export const createContextEntries = (
	lines: string[],
	startLine: number,
	endLine: number
): ContentSearchContextEntry[] => {
	const entries: ContentSearchContextEntry[] = [];
	for (let index = startLine; index <= endLine; index += 1) {
		if (index < 0 || index >= lines.length) {
			continue;
		}
		entries.push({
			line: index + 1,
			text: lines[index],
		});
	}
	return entries;
};

export const applyEditsToText = (
	originalText: string,
	edits: EditOperation[],
	filePath: string,
	dryRun: boolean
): { diff: string; modifiedText: string } => {
	const normalizedOriginal = normalizeLineEndings(originalText);
	let modifiedText = normalizedOriginal;

	for (const edit of edits) {
		const normalizedOld = normalizeLineEndings(edit.oldText);
		const normalizedNew = normalizeLineEndings(edit.newText);

		if (modifiedText.includes(normalizedOld)) {
			modifiedText = modifiedText.replace(normalizedOld, normalizedNew);
			continue;
		}

		const oldLines = normalizedOld.split('\n');
		const contentLines = modifiedText.split('\n');
		let matched = false;

		for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
			const potentialMatch = contentLines.slice(i, i + oldLines.length);
			const isMatch = oldLines.every((oldLine, index) => {
				return oldLine.trim() === potentialMatch[index]?.trim();
			});

			if (!isMatch) continue;

			const originalIndent = contentLines[i]?.match(/^\s*/)?.[0] ?? '';
			const replacementLines = normalizedNew.split('\n').map((line, index) => {
				if (index === 0) {
					return originalIndent + line.trimStart();
				}
				const oldIndent = oldLines[index]?.match(/^\s*/)?.[0] ?? '';
				const newIndent = line.match(/^\s*/)?.[0] ?? '';
				if (oldIndent && newIndent) {
					const relativeIndent = Math.max(0, newIndent.length - oldIndent.length);
					return `${originalIndent}${' '.repeat(relativeIndent)}${line.trimStart()}`;
				}
				return line;
			});

			contentLines.splice(i, oldLines.length, ...replacementLines);
			modifiedText = contentLines.join('\n');
			matched = true;
			break;
		}

		if (!matched) {
			throw new Error(`Could not find exact match for edit:\n${edit.oldText}`);
		}
	}

	const diff = createTwoFilesPatch(
		filePath,
		filePath,
		normalizedOriginal,
		modifiedText,
		'original',
		'modified'
	);
	return {
		diff,
		modifiedText: dryRun ? normalizedOriginal : modifiedText,
	};
};

export const splitTextLines = (text: string): string[] => {
	const normalized = normalizeLineEndings(text);
	if (!normalized) {
		return [];
	}
	return normalized.split('\n');
};

export const createReadFilePayload = (
	filePath: string,
	content: string,
	readMode: ReadMode,
	lineCount: number,
	startLine = 1
): Record<string, unknown> => {
	const lines = splitTextLines(content);
	const totalLines = lines.length;

	if (readMode === 'full') {
		if (content.length > DEFAULT_TEXT_FILE_MAX_CHARS) {
			return {
				file_path: filePath,
				read_mode: readMode,
				content: '',
				total_lines: totalLines,
				returned_start_line: null,
				returned_end_line: null,
				has_more: true,
				next_start_line: 1,
				truncated: true,
				warning: `full 模式最多返回 ${DEFAULT_TEXT_FILE_MAX_CHARS} 个字符；当前文件过长，请改用 segment 模式分段读取`,
				suggested_next_call: {
					tool_name: 'read_file',
					args: {
						file_path: filePath,
						read_mode: 'segment',
						start_line: 1,
						line_count: Math.min(lineCount, DEFAULT_READ_SEGMENT_LINES),
					},
				},
			};
		}

		return {
			file_path: filePath,
			read_mode: readMode,
			content: normalizeLineEndings(content),
			total_lines: totalLines,
			returned_start_line: totalLines > 0 ? 1 : null,
			returned_end_line: totalLines > 0 ? totalLines : null,
			has_more: false,
			next_start_line: null,
			truncated: false,
			warning: null,
			suggested_next_call: null,
		};
	}

	const safeLineCount = Math.max(1, lineCount);
	let startIndex = 0;
	let endIndex = 0;

	if (readMode === 'segment') {
		startIndex = Math.max(0, startLine - 1);
		endIndex = Math.min(totalLines, startIndex + safeLineCount);
	} else if (readMode === 'head') {
		startIndex = 0;
		endIndex = Math.min(totalLines, safeLineCount);
	} else {
		startIndex = Math.max(0, totalLines - safeLineCount);
		endIndex = totalLines;
	}

	const selectedLines = lines.slice(startIndex, endIndex);
	const returnedStartLine = selectedLines.length > 0 ? startIndex + 1 : null;
	const returnedEndLine = selectedLines.length > 0 ? endIndex : null;
	const hasMore =
		readMode === 'tail'
			? startIndex > 0
			: endIndex < totalLines;
	const nextStartLine =
		readMode === 'tail' || !hasMore || returnedEndLine === null
			? null
			: returnedEndLine + 1;
	const suggestedNextCall =
		nextStartLine === null
			? null
			: {
				tool_name: 'read_file',
				args: {
					file_path: filePath,
					read_mode: 'segment',
					start_line: nextStartLine,
					line_count: safeLineCount,
				},
			};

	return {
		file_path: filePath,
		read_mode: readMode,
		content: selectedLines.join('\n'),
		total_lines: totalLines,
		returned_start_line: returnedStartLine,
		returned_end_line: returnedEndLine,
		has_more: hasMore,
		next_start_line: nextStartLine,
		truncated: hasMore,
		warning:
			readMode === 'tail' && hasMore
				? 'tail 模式只返回末尾片段；如果需要继续向前阅读，请改用 segment 模式'
				: null,
		suggested_next_call: suggestedNextCall,
	};
};

export const asStructuredOrText = <T extends Record<string, unknown>>(
	responseFormat: BuiltinResponseFormat,
	value: T,
	textFactory?: (structured: T) => string
): T | string => {
	if (responseFormat === 'json') {
		return value;
	}
	return textFactory ? textFactory(value) : toCanonicalJsonText(value);
};

