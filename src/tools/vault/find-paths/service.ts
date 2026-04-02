import { TFile, TFolder, type App } from 'obsidian';
import { localInstance } from 'src/i18n/locals';
import { getFolderOrThrow } from '../_shared/helpers';
import { normalizeDirectoryPath, toRelativeChildPath } from '../_shared/path';
import { asStructuredOrText, formatLocal } from '../_shared/result';
import {
	collectDescendants,
	getPathSearchMatchMeta,
} from '../filesystemFileOps';
import type { PathSearchMatch } from '../filesystemToolUtils';
import type { FindPathsArgs } from './schema';

export const executeFindPaths = async (
	app: App,
	input: FindPathsArgs,
): Promise<Record<string, unknown> | string> => {
	const {
		query,
		scope_path = '/',
		target_type = 'any',
		match_mode = 'contains',
		max_results = 100,
		response_format = 'json',
	} = input;
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
				relativePath,
			);
			if (!meta) {
				return null;
			}
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
					`${entry.type === 'directory' ? '[DIR]' : '[FILE]'} ${entry.path}`,
				),
				...(meta.truncated
					? [
						formatLocal(
							localInstance.mcp_fs_search_files_truncated,
							meta.max_results,
						),
					]
					: []),
			].join('\n');
		},
	);
};
