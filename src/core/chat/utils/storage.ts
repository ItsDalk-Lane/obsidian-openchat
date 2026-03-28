import type { ObsidianApiProvider, VaultEntry } from 'src/providers/providers.types';

export const sanitizeFileName = (name: string): string => {
	const trimmed = name.trim();
	const sanitized = trimmed.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ');
	return sanitized.length > 0 ? sanitized : 'chat-session';
};

export const ensureFolderExists = async (
	obsidianApi: Pick<ObsidianApiProvider, 'ensureVaultFolder' | 'getVaultEntry'>,
	folderPath: string,
): Promise<VaultEntry> => {
	const normalized = await obsidianApi.ensureVaultFolder(folderPath);
	const entry = obsidianApi.getVaultEntry(normalized);
	if (entry?.kind === 'folder') {
		return entry;
	}
	throw new Error(`无法创建聊天历史文件夹: ${normalized}`);
};

export const joinPath = (folder: string, fileName: string): string => {
	return `${folder.replace(/[\\/]+$/gu, '')}/${fileName}`.replace(/\\/gu, '/').replace(/\/+/gu, '/');
};
