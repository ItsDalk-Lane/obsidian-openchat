import type { App, TFile } from 'obsidian';
import { normalizeAndValidatePath } from 'src/core/services/fileOperationHelpers';
import type { BuiltinValidationResult } from '../../runtime/types';
import { getFileOrThrow } from '../../vault/_shared/helpers';
import { normalizeFilePath } from '../../vault/_shared/path';
import { cleanLinkText } from '../../link/get-first-link-path/service';
import type {
	BacklinkAnalyzeArgs,
	BacklinkAnalyzeResult,
} from './schema';

interface LinkLike {
	link?: string;
}

interface FileCacheLike {
	links?: LinkLike[];
	embeds?: LinkLike[];
	frontmatterLinks?: LinkLike[];
}

interface BacklinkDictLike {
	keys(): string[];
	get(key: string): unknown[] | null;
}

interface PathCount {
	path: string;
	count: number;
}

const normalizeBacklinkPath = (filePath: string): string => {
	normalizeAndValidatePath(filePath);
	const normalized = normalizeFilePath(filePath, 'file_path');
	if (!normalized.endsWith('.md')) {
		throw new Error('backlink_analyze 目前只支持 Markdown 笔记');
	}
	return normalized;
};

const getFileCache = (app: App, file: TFile): FileCacheLike | null => {
	const cache = app.metadataCache.getFileCache(file);
	return cache as FileCacheLike | null;
};

const getBacklinks = (app: App, file: TFile): BacklinkDictLike | null => {
	const backlinks = app.metadataCache.getBacklinksForFile(file);
	return backlinks as unknown as BacklinkDictLike | null;
};

const toSortedCounts = (counts: Map<string, number>): PathCount[] => {
	return Array.from(counts.entries())
		.map(([path, count]) => ({ path, count }))
		.sort((left, right) => right.count - left.count || left.path.localeCompare(right.path));
};

const countReferences = (references: unknown[] | null): number => {
	return Array.isArray(references) ? references.length : 0;
};

const getIncomingCounts = (app: App, file: TFile): Map<string, number> => {
	const backlinks = getBacklinks(app, file);
	const counts = new Map<string, number>();
	if (!backlinks) {
		return counts;
	}

	for (const path of backlinks.keys()) {
		if (!path || path === file.path) {
			continue;
		}
		const count = countReferences(backlinks.get(path));
		if (count > 0) {
			counts.set(path, count);
		}
	}

	return counts;
};

const collectLinkEntries = (cache: FileCacheLike | null): LinkLike[] => {
	if (!cache) {
		return [];
	}
	return [
		...(Array.isArray(cache.links) ? cache.links : []),
		...(Array.isArray(cache.frontmatterLinks) ? cache.frontmatterLinks : []),
		...(Array.isArray(cache.embeds) ? cache.embeds : []),
	];
};

const resolveLinkTarget = (
	app: App,
	linkPath: string,
	sourcePath: string,
): TFile | null => {
	const cache = app.metadataCache as typeof app.metadataCache & {
		getFirstLinkpathDest?: (linkpath: string, sourcePath: string) => TFile | null;
	};
	if (typeof cache.getFirstLinkpathDest === 'function') {
		return cache.getFirstLinkpathDest(linkPath, sourcePath);
	}

	const candidates = app.metadataCache.getLinkpathDest(linkPath, sourcePath);
	return candidates[0] ?? null;
};

const getOutgoingAnalysis = (
	app: App,
	file: TFile,
): { counts: Map<string, number>; unresolved: string[] } => {
	const counts = new Map<string, number>();
	const unresolved = new Set<string>();

	for (const entry of collectLinkEntries(getFileCache(app, file))) {
		const cleaned = cleanLinkText(entry.link ?? '');
		if (!cleaned) {
			continue;
		}
		const target = resolveLinkTarget(app, cleaned, file.path);
		if (!target) {
			unresolved.add(cleaned);
			continue;
		}
		if (target.path === file.path) {
			continue;
		}
		counts.set(target.path, (counts.get(target.path) ?? 0) + 1);
	}

	return {
		counts,
		unresolved: Array.from(unresolved).sort((left, right) => left.localeCompare(right)),
	};
};

const getMutualPaths = (
	incoming: Map<string, number>,
	outgoing: Map<string, number>,
): Array<{ path: string }> => {
	return Array.from(outgoing.keys())
		.filter((path) => incoming.has(path))
		.sort((left, right) => left.localeCompare(right))
		.map((path) => ({ path }));
};

export const validateBacklinkAnalyzeInput = (
	args: BacklinkAnalyzeArgs,
): BuiltinValidationResult => {
	try {
		normalizeBacklinkPath(args.file_path);
		if (args.depth === 2) {
			return {
				ok: false,
				summary: 'backlink_analyze 当前阶段只支持 depth=1 的一跳分析。',
			};
		}
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
			notes: ['backlink_analyze 只用于理解笔记关系，不会修改文件。'],
		};
	}
};

export const summarizeBacklinkAnalyze = (
	args: Partial<BacklinkAnalyzeArgs>,
): string | null => args.file_path?.trim() || null;

export const describeBacklinkAnalyzeActivity = (
	args: Partial<BacklinkAnalyzeArgs>,
): string | null => (
	args.file_path ? `分析笔记关系 ${args.file_path}` : null
);

export const executeBacklinkAnalyze = (
	app: App,
	args: BacklinkAnalyzeArgs,
): BacklinkAnalyzeResult => {
	const normalizedPath = normalizeBacklinkPath(args.file_path);
	const file = getFileOrThrow(app, normalizedPath);
	const incomingCounts = getIncomingCounts(app, file);
	const outgoingAnalysis = getOutgoingAnalysis(app, file);

	return {
		file_path: normalizedPath,
		incoming: toSortedCounts(incomingCounts),
		...(args.include_outgoing === false
			? {}
			: { outgoing: toSortedCounts(outgoingAnalysis.counts) }),
		mutual: getMutualPaths(incomingCounts, outgoingAnalysis.counts),
		...(args.include_unresolved
			? { unresolved: outgoingAnalysis.unresolved }
			: {}),
	};
};
