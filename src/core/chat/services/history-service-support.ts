import type { VaultEntry } from 'src/providers/providers.types';
import { clonePlanSnapshot } from 'src/tools/runtime/plan-state';
import {
	ensureFolderExists,
	joinPath,
	sanitizeFileName,
} from 'src/core/chat/utils/storage';
import type {
	ChatMessage,
	ChatSession,
	SelectedFile,
	SelectedFolder,
} from '../types/chat';
import type { ChatHistoryParser } from './chat-history-parser';
import type { MessageService } from './message-service';

export const FRONTMATTER_DELIMITER = '---';

export interface HistoryHostSupport {
	deleteVaultPath(filePath: string): Promise<void>;
	ensureVaultFolder(path: string): Promise<void>;
	getFrontmatter(filePath: string): Record<string, unknown> | null;
	getVaultEntry(filePath: string): VaultEntry | null;
	listFolderEntries(path: string): VaultEntry[];
	parseYaml(content: string): unknown;
	pathExists(path: string): Promise<boolean>;
	readVaultFile(filePath: string): Promise<string>;
	statPath(filePath: string): Promise<{ ctime?: number; mtime?: number; size?: number } | null>;
	stringifyYaml(value: Record<string, unknown>): string;
	writeVaultFile(filePath: string, content: string): Promise<void>;
}

export const buildHistorySessionFrontmatter = (
	parser: ChatHistoryParser,
	session: ChatSession,
): Record<string, unknown> => ({
	id: session.id,
	title: session.title,
	model: session.modelId,
	created: parser.formatTimestamp(session.createdAt),
	updated: parser.formatTimestamp(session.updatedAt),
	messageCount: session.messages.length,
	contextNotes: session.contextNotes ?? [],
	enableTemplateAsSystemPrompt: session.enableTemplateAsSystemPrompt ?? false,
	multiModelMode: session.multiModelMode ?? 'single',
	activeCompareGroupId: session.activeCompareGroupId,
	layoutMode: session.layoutMode,
	livePlan: clonePlanSnapshot(session.livePlan ?? null),
	contextCompaction: session.contextCompaction ?? null,
	requestTokenState: session.requestTokenState ?? null,
});

export const ensureHistoryFolder = async (
	obsidianApi: Pick<HistoryHostSupport, 'ensureVaultFolder' | 'getVaultEntry'>,
	folderPath: string,
): Promise<VaultEntry> => {
	return await ensureFolderExists(obsidianApi, folderPath);
};

export const resolveUniqueHistoryPath = async (
	obsidianApi: Pick<HistoryHostSupport, 'pathExists'>,
	folderPath: string,
	fileName: string,
): Promise<string> => {
	const targetPath = joinPath(folderPath, fileName);
	if (!(await obsidianApi.pathExists(targetPath))) {
		return targetPath;
	}
	const timestamp = new Date().toISOString().replace(/[:.]/gu, '-').slice(0, 19);
	return joinPath(folderPath, fileName.replace(/\.md$/u, `-${timestamp}.md`));
};

export const writeHistoryFrontmatterOnly = async (
	obsidianApi: Pick<HistoryHostSupport, 'stringifyYaml' | 'writeVaultFile'>,
	filePath: string,
	frontmatter: Record<string, unknown>,
): Promise<void> => {
	await obsidianApi.writeVaultFile(
		filePath,
		`${FRONTMATTER_DELIMITER}\n${obsidianApi.stringifyYaml(frontmatter)}${FRONTMATTER_DELIMITER}\n\n`,
	);
};

export const writeHistoryFrontmatterAndBody = async (
	obsidianApi: Pick<HistoryHostSupport, 'stringifyYaml' | 'writeVaultFile'>,
	filePath: string,
	frontmatter: Record<string, unknown>,
	body: string,
): Promise<void> => {
	const content = `${FRONTMATTER_DELIMITER}
${obsidianApi.stringifyYaml(frontmatter)}${FRONTMATTER_DELIMITER}

${body}
`;
	await obsidianApi.writeVaultFile(filePath, content);
};

export const writeHistorySessionFile = async (
	obsidianApi: Pick<HistoryHostSupport, 'stringifyYaml' | 'writeVaultFile'>,
	messageService: MessageService,
	filePath: string,
	frontmatter: Record<string, unknown>,
	messages: ChatMessage[],
): Promise<void> => {
	const body = messages
		.map((message) => messageService.serializeMessage(message))
		.join('\n\n');
	await writeHistoryFrontmatterAndBody(obsidianApi, filePath, frontmatter, body);
};

export const buildContextNotesFromSelections = (
	selectedFiles?: SelectedFile[],
	selectedFolders?: SelectedFolder[],
): string[] => {
	return [
		...(selectedFiles?.map((file) => `[[${file.name}]]`) ?? []),
		...(selectedFolders?.map((folder) => folder.path) ?? []),
	];
};

export const updateHistoryFileTimestamp = async (
	obsidianApi: Pick<HistoryHostSupport, 'getFrontmatter'>,
	parser: ChatHistoryParser,
	filePath: string,
	timestamp: number,
	selectedFiles: SelectedFile[] | undefined,
	selectedFolders: SelectedFolder[] | undefined,
	updateFileFrontmatter: (
		targetFilePath: string,
		updates: Record<string, unknown>,
	) => Promise<void>,
): Promise<void> => {
	const updates: Record<string, unknown> = {
		updated: parser.formatTimestamp(timestamp),
	};
	const nextContextNotes = buildContextNotesFromSelections(selectedFiles, selectedFolders);
	if (nextContextNotes.length > 0) {
		const frontmatter = obsidianApi.getFrontmatter(filePath);
		const existingContextNotes = Array.isArray(frontmatter?.contextNotes)
			? frontmatter.contextNotes.filter((item): item is string => typeof item === 'string')
			: [];
		updates.contextNotes = [...existingContextNotes, ...nextContextNotes];
	}
	await updateFileFrontmatter(filePath, updates);
};

export const createNewSessionFileName = (title: string, sessionId: string): string => {
	return `${sanitizeFileName(title || sessionId)}.md`;
};

export const isHistoryFileEntry = (
	obsidianApi: Pick<HistoryHostSupport, 'getVaultEntry'>,
	filePath: string,
): boolean => {
	return obsidianApi.getVaultEntry(filePath)?.kind === 'file';
};

export const isMarkdownHistoryEntry = (entry: VaultEntry): boolean => {
	return entry.kind === 'file' && entry.name.toLowerCase().endsWith('.md');
};

export const shouldRewriteLegacyToolCalls = (content: string): boolean => {
	return content.includes('FF_TOOL_CALLS_BASE64')
		|| content.includes('FF_TOOL_CALLS_BLOCK_START')
		|| content.includes('工具调用 {{FF_TOOL_CALLS}}');
};

export const getHistoryEntryBasename = (entry: VaultEntry): string => {
	return entry.name.replace(/\.md$/u, '');
};

export const getHistoryPathBasename = (filePath: string): string => {
	return filePath.split('/').pop()?.replace(/\.md$/u, '') ?? filePath;
};

export const readHistoryString = (value: unknown): string | null => {
	return typeof value === 'string' && value.trim().length > 0 ? value : null;
};
