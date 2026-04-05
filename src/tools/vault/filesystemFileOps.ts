import { App, TAbstractFile, TFile, TFolder } from 'obsidian';
import { localInstance } from 'src/i18n/locals';
import { minimatch } from 'minimatch';
import { executeVaultQuery } from './vault-query';
import {
	type FilesystemEntry,
	mimeTypes,
	toRelativeChildPath,
	MAX_CONTENT_SEARCH_FILE_SIZE_BYTES,
	binaryFileExtensions,
} from './filesystemToolUtils';

export const toBase64 = (buffer: ArrayBuffer): string =>
	Buffer.from(buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer).toString(
		'base64'
	);

export const getMimeType = (path: string): string => {
	const extension = path.split('.').pop()?.toLowerCase() ?? '';
	return mimeTypes[extension] ?? 'application/octet-stream';
};

export const toQueryIndexResponse = (
	result: Awaited<ReturnType<typeof executeVaultQuery>>
): Record<string, unknown> => ({
	columns: result.columns,
	rows: result.rows,
	meta: {
		data_source: result.meta.dataSource,
		total_before_limit: result.meta.totalBeforeLimit,
		returned: result.meta.returned,
		limit: result.meta.limit,
		offset: result.meta.offset,
		truncated: result.meta.truncated,
	},
});

const isExcludedByPatterns = (
	relativePath: string,
	patterns: string[]
): boolean => {
	return patterns.some((pattern) => {
		if (minimatch(relativePath, pattern, { dot: true })) {
			return true;
		}
		return (
			minimatch(relativePath, `**/${pattern}`, { dot: true })
			|| minimatch(relativePath, `**/${pattern}/**`, { dot: true })
		);
	});
};

export const collectDescendants = (folder: TFolder): TAbstractFile[] => {
	const collected: TAbstractFile[] = [];
	for (const child of folder.children) {
		collected.push(child);
		if (child instanceof TFolder) {
			collected.push(...collectDescendants(child));
		}
	}
	return collected;
};

export const collectVaultFilePaths = (app: App, fileExtensions: string[] | null): string[] =>
	app.vault
		.getFiles()
		.filter((file) => {
			if (!fileExtensions || fileExtensions.length === 0) {
				return true;
			}
			return fileExtensions.includes(file.extension.toLowerCase());
		})
		.map((file) => file.path)
		.sort((a, b) => a.localeCompare(b));

export const buildDirectoryTree = (
	folder: TFolder,
	rootPath: string,
	excludePatterns: string[],
	maxDepth: number,
	maxNodes: number,
	state: { nodes: number; truncated: boolean },
	currentDepth = 1
): FilesystemEntry[] => {
	const result: FilesystemEntry[] = [];

	for (const child of folder.children) {
		if (state.nodes >= maxNodes) {
			state.truncated = true;
			break;
		}
		const relativePath = toRelativeChildPath(rootPath, child.path);
		if (isExcludedByPatterns(relativePath, excludePatterns)) {
			continue;
		}
		state.nodes += 1;

		if (child instanceof TFolder) {
			if (currentDepth >= maxDepth) {
				state.truncated = true;
				result.push({
					name: child.name,
					type: 'directory',
				});
				continue;
			}
			result.push({
				name: child.name,
				type: 'directory',
				children: buildDirectoryTree(
					child,
					rootPath,
					excludePatterns,
					maxDepth,
					maxNodes,
					state,
					currentDepth + 1
				),
			});
			continue;
		}

		result.push({
			name: child.name,
			type: 'file',
		});
	}

	return result;
};

const normalizeSearchText = (value: string): string => value.trim().toLowerCase();

const matchSearchCandidate = (
	query: string,
	matchMode: 'contains' | 'exact' | 'prefix' | 'suffix' | 'glob',
	candidate: string
): boolean => {
	const normalizedCandidate = candidate.toLowerCase();
	if (matchMode === 'glob') {
		return minimatch(normalizedCandidate, query.toLowerCase(), {
			dot: true,
			nocase: true,
		});
	}

	const normalizedQuery = normalizeSearchText(query);
	if (!normalizedQuery) return false;

	switch (matchMode) {
		case 'exact':
			return normalizedCandidate === normalizedQuery;
		case 'prefix':
			return normalizedCandidate.startsWith(normalizedQuery);
		case 'suffix':
			return normalizedCandidate.endsWith(normalizedQuery);
		case 'contains':
		default:
			return normalizedCandidate.includes(normalizedQuery);
	}
};

export const getPathSearchMatchMeta = (
	query: string,
	matchMode: 'contains' | 'exact' | 'prefix' | 'suffix' | 'glob',
	name: string,
	relativePath: string
): { matched_on: 'name' | 'path'; score: number } | null => {
	const normalizedName = name.toLowerCase();
	const normalizedRelativePath = relativePath.toLowerCase();
	const normalizedQuery = normalizeSearchText(query);

	if (matchMode === 'contains') {
		if (normalizedName === normalizedQuery) {
			return { matched_on: 'name', score: 0 };
		}
		if (normalizedName.startsWith(normalizedQuery)) {
			return { matched_on: 'name', score: 1 };
		}
		if (normalizedName.includes(normalizedQuery)) {
			return { matched_on: 'name', score: 2 };
		}
		if (normalizedRelativePath === normalizedQuery) {
			return { matched_on: 'path', score: 3 };
		}
		if (normalizedRelativePath.startsWith(normalizedQuery)) {
			return { matched_on: 'path', score: 4 };
		}
		if (normalizedRelativePath.includes(normalizedQuery)) {
			return { matched_on: 'path', score: 5 };
		}
		return null;
	}

	if (matchSearchCandidate(query, matchMode, name)) {
		return { matched_on: 'name', score: 0 };
	}
	if (matchSearchCandidate(query, matchMode, relativePath)) {
		return { matched_on: 'path', score: 1 };
	}
	return null;
};

export const shouldSkipContentSearchFile = (
	file: TFile,
	allowedExtensions: string[] | null
): string | null => {
	const extension = file.extension?.toLowerCase() ?? '';
	if (allowedExtensions && allowedExtensions.length > 0) {
		if (!allowedExtensions.includes(extension)) {
			return 'filtered';
		}
	}
	if (binaryFileExtensions.has(extension)) {
		return localInstance.mcp_fs_search_content_skipped_binary;
	}
	if ((file.stat?.size ?? 0) > MAX_CONTENT_SEARCH_FILE_SIZE_BYTES) {
		return localInstance.mcp_fs_search_content_skipped_large;
	}
	return null;
};

