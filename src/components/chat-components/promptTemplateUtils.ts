import type { ObsidianApiProvider } from 'src/providers/providers.types';
import { getPromptTemplatePath } from 'src/utils/aiPathSupport';

export interface PromptTemplateEntry {
	path: string;
	label: string;
	preview: string;
}

const normalizeTemplatePreview = (content: string): string =>
	content.replace(/\s+/gu, ' ').trim();

export const buildPromptTemplatePreview = (
	content: string,
	maxLength = 100,
): string => {
	const normalized = normalizeTemplatePreview(content);
	if (normalized.length <= maxLength) {
		return normalized;
	}

	return `${normalized.slice(0, maxLength)}...`;
};

const collectPromptTemplateFiles = (
	obsidianApi: Pick<ObsidianApiProvider, 'listFolderEntries'>,
	folderPath: string,
	entries: Array<{ path: string; name: string }>,
): void => {
	for (const entry of obsidianApi.listFolderEntries(folderPath)) {
		if (entry.kind === 'folder') {
			collectPromptTemplateFiles(obsidianApi, entry.path, entries);
			continue;
		}

		if (entry.path.toLowerCase().endsWith('.md')) {
			entries.push({ path: entry.path, name: entry.name });
		}
	}
};

export async function listPromptTemplateEntries(
	obsidianApi: Pick<ObsidianApiProvider, 'listFolderEntries' | 'readVaultFile'>,
	aiDataFolder: string,
): Promise<PromptTemplateEntry[]> {
	const promptTemplateFolder = getPromptTemplatePath(aiDataFolder);
	const fileEntries: Array<{ path: string; name: string }> = [];
	collectPromptTemplateFiles(obsidianApi, promptTemplateFolder, fileEntries);

	const templates = await Promise.all(
		fileEntries.map(async (entry) => {
			const content = await obsidianApi.readVaultFile(entry.path);
			return {
				path: entry.path,
				label: entry.path.startsWith(`${promptTemplateFolder}/`)
					? entry.path.slice(promptTemplateFolder.length + 1)
					: entry.name,
				preview: buildPromptTemplatePreview(content),
			};
		}),
	);

	return templates.sort((left, right) => left.label.localeCompare(right.label));
}

export const filterPromptTemplateEntries = (
	entries: ReadonlyArray<PromptTemplateEntry>,
	filterText: string,
): PromptTemplateEntry[] => {
	const normalizedFilter = filterText.trim().toLowerCase();
	if (!normalizedFilter) {
		return [...entries];
	}

	return entries.filter((entry) => (
		entry.label.toLowerCase().includes(normalizedFilter)
		|| entry.preview.toLowerCase().includes(normalizedFilter)
	));
};