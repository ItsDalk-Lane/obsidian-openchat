import type { App } from 'obsidian';
import type { BuiltinValidationResult } from '../../runtime/types';
import { getFolderOrThrow } from '../_shared/helpers';
import {
	createContentSearchRegex,
	normalizeFileTypeFilters,
} from '../_shared/query';
import {
	asStructuredOrText,
	type ContentSearchMatch,
	createContextEntries,
	isPathUnderDirectory,
	normalizeDirectoryPath,
	normalizeLineEndings,
} from '../filesystemToolUtils';
import { shouldSkipContentSearchFile } from '../filesystemFileOps';
import type { SearchContentArgs } from './schema';

const formatSearchContentText = (
	structured: Record<string, unknown>,
): string => {
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
};

export const validateSearchContentInput = (
	app: App,
	args: SearchContentArgs,
): BuiltinValidationResult => {
	try {
		const normalizedScopePath = normalizeDirectoryPath(args.scope_path, 'scope_path');
		if (normalizedScopePath) {
			getFolderOrThrow(app, normalizedScopePath);
		}
		createContentSearchRegex(
			args.pattern,
			args.match_mode,
			args.case_sensitive,
		);
		normalizeFileTypeFilters(args.file_types);
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
			notes: ['search_content 会递归读取候选文本文件，并跳过二进制或超大文件。'],
		};
	}
};

export const executeSearchContent = async (
	app: App,
	args: SearchContentArgs,
): Promise<unknown> => {
	const normalizedScopePath = normalizeDirectoryPath(args.scope_path, 'scope_path');
	if (normalizedScopePath) {
		getFolderOrThrow(app, normalizedScopePath);
	}
	const regex = createContentSearchRegex(
		args.pattern,
		args.match_mode,
		args.case_sensitive,
	);
	const allowedExtensions = normalizeFileTypeFilters(args.file_types);
	const matches: ContentSearchMatch[] = [];
	const skippedFiles: Array<{ path: string; reason: string }> = [];
	let scannedFiles = 0;

	const buildResponse = (truncated: boolean): unknown => asStructuredOrText(
		args.response_format,
		{
			matches,
			meta: {
				scope_path: normalizedScopePath || '/',
				match_mode: args.match_mode,
				file_types: allowedExtensions ?? [],
				max_results: args.max_results,
				case_sensitive: args.case_sensitive,
				context_lines: args.context_lines,
				scanned_files: scannedFiles,
				skipped_files: skippedFiles,
				returned: matches.length,
				has_more: truncated,
				truncated,
			},
		},
		(structured) => formatSearchContentText(structured),
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
				before: createContextEntries(lines, index - args.context_lines, index - 1),
				after: createContextEntries(lines, index + 1, index + args.context_lines),
			});
			if (matches.length >= args.max_results) {
				return buildResponse(true);
			}
		}
	}

	return buildResponse(false);
};