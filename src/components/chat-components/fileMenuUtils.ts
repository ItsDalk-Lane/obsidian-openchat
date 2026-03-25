import { App, TFile, TFolder, CachedMetadata } from 'obsidian';
import { localInstance } from 'src/i18n/locals';

export interface FolderItem {
	folder: TFolder;
	level: number;
	isExpanded: boolean;
}

/** 获取文件的副标题（显示父目录路径） */
export function getFileSecondaryText(file: TFile): string {
	// 避免"文件名 + 含文件名的完整路径"导致的重复观感：第二行仅显示父目录
	return file.parent?.path ?? '/';
}

/** 获取文件夹的副标题（显示父目录路径） */
export function getFolderSecondaryText(folder: TFolder): string {
	// 避免"文件夹名 + 顶层同名路径"重复：第二行显示父目录（根目录显示 /）
	if (folder.path === '/') return '/';
	return folder.parent?.path ?? '/';
}

/** 在文件内容（名称、标题、标签、链接）中搜索关键词 */
export function searchInFile(file: TFile, cache: CachedMetadata, query: string): string[] {
	const matches: string[] = [];

	// 搜索文件名
	if (file.name.toLowerCase().includes(query)) {
		matches.push(localInstance.chat_file_match_filename_prefix.replace('{name}', file.name));
	}

	// 搜索标题
	if (cache.headings) {
		for (const heading of cache.headings) {
			if (heading.heading.toLowerCase().includes(query)) {
				matches.push(localInstance.chat_file_match_heading_prefix.replace('{name}', heading.heading));
			}
		}
	}

	// 搜索标签
	if (cache.tags) {
		for (const tag of cache.tags) {
			if (tag.tag.toLowerCase().includes(query)) {
				matches.push(localInstance.chat_file_match_tag_prefix.replace('{name}', tag.tag));
			}
		}
	}

	// 搜索链接
	if (cache.links) {
		for (const link of cache.links) {
			if (link.displayText && link.displayText.toLowerCase().includes(query)) {
				matches.push(localInstance.chat_file_match_link_prefix.replace('{name}', link.displayText));
			}
		}
	}

	return matches;
}

/** 获取过滤后的文件列表（按最近修改时间排序） */
export function getFilteredFiles(app: App, fileSearchQuery: string): TFile[] {
	return app.vault.getFiles()
		.filter(file => !file.path.startsWith('.obsidian'))
		.filter(file => {
			if (!fileSearchQuery) return true;
			const query = fileSearchQuery.toLowerCase();
			return file.name.toLowerCase().includes(query) ||
				file.path.toLowerCase().includes(query);
		})
		.sort((a, b) => {
			// 按照最近修改时间排序，最近修改的在前
			const timeA = a.stat?.mtime || 0;
			const timeB = b.stat?.mtime || 0;
			return timeB - timeA;
		});
}

/** 获取文件夹树结构（支持搜索过滤与展开状态） */
export function getFolderTree(app: App, folderSearchQuery: string, expandedFolders: Set<string>): FolderItem[] {
	const items: FolderItem[] = [];
	const query = folderSearchQuery.toLowerCase().trim();

	const collectFolders = (folder: TFolder, level = 0) => {
		// 使用原始文件夹名进行搜索匹配（与菜单栏搜索保持一致）
		const originalFolderName = folder.name.toLowerCase();
		const isMatched = !query || originalFolderName.includes(query);

		// 如果当前文件夹匹配，或者没有搜索条件，则显示
		if (isMatched) {
			items.push({
				folder,
				level,
				isExpanded: expandedFolders.has(folder.path) || (query ? true : false)
			});
		}

		// 处理子文件夹：
		// 1. 没有搜索条件时，只处理已展开的文件夹的子项
		// 2. 有搜索条件时，搜索所有文件夹层级
		if (!query) {
			// 没有搜索条件，只处理已展开的文件夹
			if (expandedFolders.has(folder.path)) {
				const subfolders = folder.children.filter(child => child instanceof TFolder) as TFolder[];
				subfolders.sort((a, b) => a.name.localeCompare(b.name));
				subfolders.forEach(subfolder => collectFolders(subfolder, level + 1));
			}
		} else {
			// 有搜索条件，处理所有子文件夹进行递归搜索
			const subfolders = folder.children.filter(child => child instanceof TFolder) as TFolder[];
			subfolders.sort((a, b) => a.name.localeCompare(b.name));
			subfolders.forEach(subfolder => collectFolders(subfolder, level + 1));
		}
	};

	const rootFolder = app.vault.getRoot();
	collectFolders(rootFolder);

	return items;
}
