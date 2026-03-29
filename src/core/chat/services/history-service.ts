import type { ObsidianApiProvider } from 'src/providers/providers.types';
import type { PlanSnapshot } from 'src/tools/runtime/plan-state';
import type {
	ChatMessage,
	ChatSession,
	SelectedFile,
	SelectedFolder,
} from '../types/chat';
import { MessageService } from './message-service';
import { ChatHistoryParser } from './chat-history-parser';
import { PlanSnapshotResolver } from './plan-snapshot-resolver';
import { DebugLogger } from '../../../utils/DebugLogger';
import {
	buildContextNotesFromSelections,
	buildHistorySessionFrontmatter,
	createNewSessionFileName,
	ensureHistoryFolder,
	getHistoryEntryBasename,
	getHistoryPathBasename,
	type HistoryHostSupport,
	isHistoryFileEntry,
	isMarkdownHistoryEntry,
	readHistoryString,
	resolveUniqueHistoryPath,
	shouldRewriteLegacyToolCalls,
	updateHistoryFileTimestamp,
	writeHistoryFrontmatterAndBody,
	writeHistoryFrontmatterOnly,
	writeHistorySessionFile,
} from './history-service-support';

export interface ChatHistoryEntry {
	id: string;
	title: string;
	filePath: string;
	modelId?: string;
	updatedAt: number;
	createdAt: number;
}
type HistoryHost = Pick<ObsidianApiProvider, keyof HistoryHostSupport>;
export class HistoryService {
	private folderPath: string;
	private readonly parser: ChatHistoryParser;
	private readonly planResolver = new PlanSnapshotResolver();
	constructor(
		private readonly obsidianApi: HistoryHost,
		private readonly messageService: MessageService,
		initialFolder: string,
	) {
		this.folderPath = initialFolder;
		this.parser = new ChatHistoryParser(messageService, obsidianApi);
	}

	getFolder(): string {
		return this.folderPath;
	}

	setFolder(folder: string): void {
		this.folderPath = folder;
	}
	async listSessions(): Promise<ChatHistoryEntry[]> {
		try {
			const folder = await ensureHistoryFolder(this.obsidianApi, this.folderPath);
			const entries: ChatHistoryEntry[] = [];
			for (const child of this.obsidianApi.listFolderEntries(folder.path)) {
				if (!isMarkdownHistoryEntry(child)) {
					continue;
				}
				const frontmatter = this.obsidianApi.getFrontmatter(child.path);
				if (!frontmatter?.id) {
					continue;
				}
				const stat = await this.obsidianApi.statPath(child.path);
				entries.push({
					id: String(frontmatter.id),
					title: readHistoryString(frontmatter.title) ?? getHistoryEntryBasename(child),
					filePath: child.path,
					modelId: readHistoryString(frontmatter.model) ?? undefined,
					createdAt: this.parser.parseTimestamp(frontmatter.created ?? stat?.ctime ?? 0),
					updatedAt: this.parser.parseTimestamp(frontmatter.updated ?? stat?.mtime ?? 0),
				});
			}
			return entries.sort((left, right) => right.updatedAt - left.updatedAt);
		} catch (error) {
			DebugLogger.error('[Chat][HistoryService] listSessions error', error);
			return [];
		}
	}

	async saveSession(session: ChatSession): Promise<string> {
		if (session.filePath && isHistoryFileEntry(this.obsidianApi, session.filePath)) {
			const existingContent = await this.obsidianApi.readVaultFile(session.filePath);
			if (shouldRewriteLegacyToolCalls(existingContent)) {
				await this.rewriteMessagesOnly(session.filePath, session.messages);
			}
			await this.updateSessionFrontmatter(
				session.filePath,
				buildHistorySessionFrontmatter(this.parser, session),
			);
			return session.filePath;
		}
		const folder = await ensureHistoryFolder(this.obsidianApi, this.folderPath);
		const baseFileName = session.messages.length > 0
			? `${this.parser.generateHistoryFileName(session.messages[0])}.md`
			: createNewSessionFileName(session.title, session.id);
		const finalFilePath = await resolveUniqueHistoryPath(
			this.obsidianApi,
			folder.path,
			baseFileName,
		);
		await writeHistorySessionFile(
			this.obsidianApi,
			this.messageService,
			finalFilePath,
			buildHistorySessionFrontmatter(this.parser, session),
			session.messages,
		);
		return finalFilePath;
	}

	async loadSession(filePath: string): Promise<ChatSession | null> {
		try {
			if (!isHistoryFileEntry(this.obsidianApi, filePath)) {
				return null;
			}
			const data = await this.obsidianApi.readVaultFile(filePath);
			const { frontmatter, body } = this.parser.extractFrontmatter(data);
			if (!frontmatter?.id) {
				return null;
			}
			const stat = await this.obsidianApi.statPath(filePath);
			const messages = this.parser.parseMessages(body);
			const persistedPlan = this.planResolver.parsePlanSnapshot(frontmatter.livePlan);
			const messagePlan = this.planResolver.extractLatestPlanSnapshot(messages);
			return {
				id: String(frontmatter.id),
				title: readHistoryString(frontmatter.title) ?? getHistoryPathBasename(filePath),
				modelId: readHistoryString(frontmatter.model) ?? '',
				messages,
				contextNotes: Array.isArray(frontmatter.contextNotes)
					? frontmatter.contextNotes.filter((item): item is string => typeof item === 'string')
					: [],
				createdAt: this.parser.parseTimestamp(frontmatter.created ?? stat?.ctime ?? 0),
				updatedAt: this.parser.parseTimestamp(frontmatter.updated ?? stat?.mtime ?? 0),
				selectedImages: [],
				enableTemplateAsSystemPrompt: this.parser.parseBoolean(frontmatter.enableTemplateAsSystemPrompt, false),
				multiModelMode: this.parser.parseMultiModelMode(frontmatter.multiModelMode),
				layoutMode: this.parser.parseLayoutMode(frontmatter.layoutMode),
				livePlan: this.planResolver.resolveLivePlan(persistedPlan, messagePlan),
				contextCompaction: this.parser.parseContextCompaction(frontmatter.contextCompaction),
				requestTokenState: this.parser.parseRequestTokenState(frontmatter.requestTokenState),
				filePath,
			};
		} catch (error) {
			DebugLogger.error('[Chat][HistoryService] loadSession error', error);
			return null;
		}
	}

	async deleteSession(filePath: string): Promise<void> {
		await this.obsidianApi.deleteVaultPath(filePath);
	}

	async createNewSessionFile(session: ChatSession): Promise<string> {
		const folder = await ensureHistoryFolder(this.obsidianApi, this.folderPath);
		const baseFileName = createNewSessionFileName(session.title, session.id);
		const finalFilePath = await resolveUniqueHistoryPath(
			this.obsidianApi,
			folder.path,
			baseFileName,
		);
		await writeHistoryFrontmatterOnly(
			this.obsidianApi,
			finalFilePath,
			buildHistorySessionFrontmatter(this.parser, session),
		);
		return finalFilePath;
	}

	async appendMessageToFile(
		filePath: string,
		message: ChatMessage,
		selectedFiles?: SelectedFile[],
		selectedFolders?: SelectedFolder[],
	): Promise<void> {
		if (!filePath) {
			throw new Error('文件路径为空，无法追加消息');
		}
		if (!isHistoryFileEntry(this.obsidianApi, filePath)) {
			throw new Error(`文件不存在: ${filePath}`);
		}
		const currentContent = await this.obsidianApi.readVaultFile(filePath);
		const serializedMessage = this.messageService.serializeMessage(message);
		const nextContent = `${currentContent.trimEnd()}\n\n${serializedMessage}\n`;
		await this.obsidianApi.writeVaultFile(filePath, nextContent);
		await updateHistoryFileTimestamp(
			this.obsidianApi,
			this.parser,
			filePath,
			Date.now(),
			selectedFiles,
			selectedFolders,
			async (targetFilePath, updates) => {
				await this.updateFileFrontmatter(targetFilePath, updates);
			},
		);
	}

	async createNewSessionFileWithFirstMessage(
		session: ChatSession,
		firstMessage: ChatMessage,
		selectedFiles?: SelectedFile[],
		selectedFolders?: SelectedFolder[],
	): Promise<string> {
		const folder = await ensureHistoryFolder(this.obsidianApi, this.folderPath);
		const baseFileName = `${this.parser.generateHistoryFileName(firstMessage)}.md`;
		const finalFilePath = await resolveUniqueHistoryPath(
			this.obsidianApi,
			folder.path,
			baseFileName,
		);
		const frontmatter = buildHistorySessionFrontmatter(this.parser, {
			...session,
			title: this.parser.deriveSessionTitle(firstMessage),
			contextNotes: [
				...(session.contextNotes ?? []),
				...buildContextNotesFromSelections(selectedFiles, selectedFolders),
			],
			messages: [firstMessage],
		});
		await writeHistorySessionFile(
			this.obsidianApi,
			this.messageService,
			finalFilePath,
			frontmatter,
			[firstMessage],
		);
		return finalFilePath;
	}

	async updateFileFrontmatter(filePath: string, updates: Record<string, unknown>): Promise<void> {
		const content = await this.obsidianApi.readVaultFile(filePath);
		const { frontmatter, body } = this.parser.extractFrontmatter(content);
		if (!frontmatter) {
			DebugLogger.warn('[HistoryService] 文件没有frontmatter，无法更新');
			return;
		}
		const updatedFrontmatter = { ...frontmatter, ...updates };
		if (Object.prototype.hasOwnProperty.call(updates, 'messages') || body !== undefined) {
			updatedFrontmatter.messageCount = this.parser.parseMessages(body).length;
		}
		await writeHistoryFrontmatterAndBody(
			this.obsidianApi,
			filePath,
			updatedFrontmatter,
			body,
		);
	}

	async rewriteMessagesOnly(
		filePath: string,
		messages: ChatMessage[],
		livePlan?: PlanSnapshot | null,
	): Promise<void> {
		if (!filePath) {
			throw new Error('文件路径为空，无法重写消息');
		}
		if (!isHistoryFileEntry(this.obsidianApi, filePath)) {
			throw new Error(`文件不存在: ${filePath}`);
		}
		const content = await this.obsidianApi.readVaultFile(filePath);
		const { frontmatter } = this.parser.extractFrontmatter(content);
		if (!frontmatter) {
			throw new Error('文件没有frontmatter，无法重写消息');
		}
		frontmatter.updated = this.parser.formatTimestamp(Date.now());
		frontmatter.messageCount = messages.length;
		if (livePlan !== undefined) {
			frontmatter.livePlan = clonePlanSnapshot(livePlan);
		}
		const body = messages
			.map((message) => this.messageService.serializeMessage(message))
			.join('\n\n');
		await writeHistoryFrontmatterAndBody(
			this.obsidianApi,
			filePath,
			frontmatter,
			body,
		);
	}

	async updateSessionFrontmatter(filePath: string, updates: Record<string, unknown>): Promise<void> {
		if (!isHistoryFileEntry(this.obsidianApi, filePath)) {
			throw new Error(`文件不存在: ${filePath}`);
		}
		await this.updateFileFrontmatter(filePath, updates);
	}
}
