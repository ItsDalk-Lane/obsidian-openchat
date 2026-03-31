import type { ObsidianApiProvider } from 'src/providers/providers.types';
import { localInstance } from 'src/i18n/locals';

export interface FileMenuFileItem {
	path: string;
	name: string;
	basename: string;
	parentPath: string;
	extension: string;
}

export interface FileMenuFolderItem {
	path: string;
	name: string;
	parentPath: string;
	hasChildren: boolean;
}

export interface FolderTreeItem {
	folder: FileMenuFolderItem;
	level: number;
	isExpanded: boolean;
}

export interface FileMenuSearchResult {
	type: 'file' | 'folder';
	file?: FileMenuFileItem;
	folder?: FileMenuFolderItem;
	matches: string[];
}

export interface VaultEntrySearchIndex {
	files: FileMenuFileItem[];
	folders: FileMenuFolderItem[];
}

const ROOT_PATH = '/';

const stripExtension = (name: string): string => {
	const dotIndex = name.lastIndexOf('.');
	return dotIndex > 0 ? name.slice(0, dotIndex) : name;
};

const getParentPath = (path: string): string => {
	if (!path || path === ROOT_PATH) {
		return ROOT_PATH;
	}
	const normalized = path.replace(/\/+$/u, '');
	const lastSlashIndex = normalized.lastIndexOf('/');
	if (lastSlashIndex <= 0) {
		return ROOT_PATH;
	}
	return normalized.slice(0, lastSlashIndex) || ROOT_PATH;
};

const shouldIncludePath = (path: string): boolean =>
	path !== '.obsidian' && !path.startsWith('.obsidian/');

export const collectVaultEntries = (
	obsidianApi: ObsidianApiProvider,
	folderPath = ROOT_PATH,
): VaultEntrySearchIndex => {
	const files: FileMenuFileItem[] = [];
	const folders: FileMenuFolderItem[] = [];

	const visit = (currentPath: string) => {
		for (const entry of obsidianApi.listFolderEntries(currentPath)) {
			if (!shouldIncludePath(entry.path)) {
				continue;
			}
			if (entry.kind === 'folder') {
				const children = obsidianApi.listFolderEntries(entry.path);
				folders.push({
					path: entry.path,
					name: entry.name || ROOT_PATH,
					parentPath: getParentPath(entry.path),
					hasChildren: children.some((child) => child.kind === 'folder'),
				});
				visit(entry.path);
				continue;
			}

			const basename = stripExtension(entry.name);
			const extension = entry.name.includes('.')
				? entry.name.slice(entry.name.lastIndexOf('.') + 1)
				: '';
			files.push({
				path: entry.path,
				name: entry.name,
				basename,
				parentPath: getParentPath(entry.path),
				extension,
			});
		}
	};

	visit(folderPath);
	return { files, folders };
};

/** 获取文件的副标题（显示父目录路径） */
export function getFileSecondaryText(file: FileMenuFileItem): string {
	return file.parentPath;
}

/** 获取文件夹的副标题（显示父目录路径） */
export function getFolderSecondaryText(folder: FileMenuFolderItem): string {
	if (folder.path === ROOT_PATH) return ROOT_PATH;
	return folder.parentPath;
}

/** 获取过滤后的文件列表 */
export function getFilteredFiles(
	obsidianApi: ObsidianApiProvider,
	fileSearchQuery: string,
): FileMenuFileItem[] {
	return collectVaultEntries(obsidianApi).files
		.filter((file) => {
			if (!fileSearchQuery) return true;
			const query = fileSearchQuery.toLowerCase();
			return (
				file.basename.toLowerCase().includes(query)
				|| file.path.toLowerCase().includes(query)
			);
		})
		.sort((a, b) => a.path.localeCompare(b.path));
}

/** 获取文件夹树结构（支持搜索过滤与展开状态） */
export function getFolderTree(
	obsidianApi: ObsidianApiProvider,
	folderSearchQuery: string,
	expandedFolders: Set<string>,
): FolderTreeItem[] {
	const items: FolderTreeItem[] = [];
	const query = folderSearchQuery.toLowerCase().trim();

	const collectFolders = (folderPath: string, level = 0) => {
		const subfolders = obsidianApi
			.listFolderEntries(folderPath)
			.filter((entry) => entry.kind === 'folder')
			.sort((a, b) => a.path.localeCompare(b.path));

		for (const folder of subfolders) {
			const folderItem: FileMenuFolderItem = {
				path: folder.path,
				name: folder.name || ROOT_PATH,
				parentPath: getParentPath(folder.path),
				hasChildren: obsidianApi
					.listFolderEntries(folder.path)
					.some((entry) => entry.kind === 'folder'),
			};
			const isMatched = !query || folderItem.name.toLowerCase().includes(query);
			if (isMatched) {
				items.push({
					folder: folderItem,
					level,
					isExpanded: expandedFolders.has(folder.path) || Boolean(query),
				});
			}

			if (query || expandedFolders.has(folder.path)) {
				collectFolders(folder.path, level + 1);
			}
		}
	};

	collectFolders(ROOT_PATH);
	return items;
}

export function searchVaultEntries(
	obsidianApi: ObsidianApiProvider,
	searchQuery: string,
): FileMenuSearchResult[] {
	const query = searchQuery.toLowerCase().trim();
	if (!query) {
		return [];
	}
	const { files, folders } = collectVaultEntries(obsidianApi);
	const folderResults: FileMenuSearchResult[] = folders
		.filter((folder) => folder.name.toLowerCase().includes(query))
		.map((folder) => ({
			type: 'folder',
			folder,
			matches: [localInstance.chat_file_match_folder_prefix.replace('{name}', folder.name)],
		}));
	const fileResults: FileMenuSearchResult[] = files
		.filter((file) => (
			file.basename.toLowerCase().includes(query)
			|| file.path.toLowerCase().includes(query)
		))
		.map((file) => ({
			type: 'file',
			file,
			matches: [localInstance.chat_file_match_filename_prefix.replace('{name}', file.basename)],
		}));

	return [...folderResults, ...fileResults].slice(0, 10);
}
