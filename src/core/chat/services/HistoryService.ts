import { App, TFile, TFolder, stringifyYaml } from 'obsidian';
import {
	clonePlanSnapshot,
	type PlanSnapshot,
} from 'src/tools/runtime/plan-state';
import type {
	ChatMessage,
	ChatSession,
	SelectedFile,
	SelectedFolder,
} from '../types/chat';
import { ensureFolderExists, joinPath, sanitizeFileName } from 'src/core/chat/utils/storage';
import { MessageService } from './MessageService';
import { ChatHistoryParser } from './ChatHistoryParser';
import { PlanSnapshotResolver } from './PlanSnapshotResolver';

export interface ChatHistoryEntry {
	id: string;
	title: string;
	filePath: string;
	modelId?: string;
	updatedAt: number;
	createdAt: number;
}

const FRONTMATTER_DELIMITER = '---';

export class HistoryService {
	private folderPath: string;
	private readonly messageService: MessageService;
	private readonly parser: ChatHistoryParser;
	private readonly planResolver: PlanSnapshotResolver;

	constructor(private readonly app: App, initialFolder: string) {
		this.folderPath = initialFolder;
		this.messageService = new MessageService(app);
		this.parser = new ChatHistoryParser(this.messageService);
		this.planResolver = new PlanSnapshotResolver();
	}











	getFolder(): string {
		return this.folderPath;
	}

	setFolder(folder: string) {
		this.folderPath = folder;
	}

	async listSessions(): Promise<ChatHistoryEntry[]> {
		try {
			const folder = await this.ensureFolder();
			const entries: ChatHistoryEntry[] = [];
			for (const child of folder.children) {
				if (child instanceof TFile && child.extension === 'md') {
					const cached = this.app.metadataCache.getFileCache(child);
					const frontmatter = cached?.frontmatter;
					if (frontmatter?.id) {
						entries.push({
							id: frontmatter.id as string,
							title: (frontmatter.title as string) ?? child.basename,
							filePath: child.path,
							modelId: frontmatter.model as string,
						createdAt: this.parser.parseTimestamp(frontmatter.created ?? child.stat.ctime),
						updatedAt: this.parser.parseTimestamp(frontmatter.updated ?? child.stat.mtime)
						});
					}
				}
			}
			return entries.sort((a, b) => b.updatedAt - a.updatedAt);
		} catch (error) {
			console.error('[Chat][HistoryService] listSessions error', error);
			return [];
		}
	}

	async saveSession(session: ChatSession): Promise<string> {
		// 如果会话已有文件路径，只更新frontmatter
		if (session.filePath) {
			const file = this.app.vault.getAbstractFileByPath(session.filePath);
			if (file instanceof TFile) {
				const existingContent = await this.app.vault.read(file);
				if (
					existingContent.includes('FF_TOOL_CALLS_BASE64') ||
					existingContent.includes('FF_TOOL_CALLS_BLOCK_START') ||
					existingContent.includes('工具调用 {{FF_TOOL_CALLS}}')
				) {
					await this.rewriteMessagesOnly(session.filePath, session.messages);
				}
				await this.updateFileFrontmatter(file, {
					title: session.title,
					model: session.modelId,
					created: this.parser.formatTimestamp(session.createdAt),
					updated: this.parser.formatTimestamp(session.updatedAt),
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
				return session.filePath;
			}
		}
		
		// 如果没有文件路径或文件不存在，创建新文件
		const folder = await this.ensureFolder();
		
		// 如果有消息，使用第一条消息生成文件名
		let fileName: string;
		if (session.messages.length > 0) {
			fileName = this.parser.generateHistoryFileName(session.messages[0]) + '.md';
		} else {
			// 如果没有消息，使用会话标题生成文件名
			const sanitizedTitle = this.parser.sanitizeTitle(session.title || session.id);
			fileName = `${sanitizedTitle}.md`;
		}
		
		const filePath = joinPath(folder.path, fileName);
		
		// 如果文件已存在，添加时间戳确保唯一性
		let finalFilePath = filePath;
		if (await this.app.vault.adapter.exists(filePath)) {
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
			const uniqueFileName = fileName.replace('.md', `-${timestamp}.md`);
			finalFilePath = joinPath(folder.path, uniqueFileName);
		}
		
		const frontmatter = stringifyYaml({
			id: session.id,
			title: session.title,
			model: session.modelId,
			created: this.parser.formatTimestamp(session.createdAt),
			updated: this.parser.formatTimestamp(session.updatedAt),
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

		const body = session.messages.map((message) => this.messageService.serializeMessage(message)).join('\n\n');
		const content = `${FRONTMATTER_DELIMITER}
${frontmatter}${FRONTMATTER_DELIMITER}

${body}
`;

		await this.app.vault.create(finalFilePath, content);
		return finalFilePath;
	}

	async loadSession(filePath: string): Promise<ChatSession | null> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) {
				return null;
			}

			const data = await this.app.vault.read(file);
			const { frontmatter, body } = this.parser.extractFrontmatter(data);

			if (!frontmatter || !frontmatter.id) {
				return null;
			}

			const messages = this.parser.parseMessages(body);
			const persistedPlan = this.planResolver.parsePlanSnapshot(frontmatter.livePlan);
			const messagePlan = this.planResolver.extractLatestPlanSnapshot(messages);
			const session: ChatSession = {
				id: frontmatter.id as string,
				title: (frontmatter.title as string) ?? file.basename,
				modelId: (frontmatter.model as string) ?? '',
				messages,
				contextNotes: (frontmatter.contextNotes as string[]) ?? [],
				createdAt: this.parser.parseTimestamp(frontmatter.created ?? file.stat.ctime),
				updatedAt: this.parser.parseTimestamp(frontmatter.updated ?? file.stat.mtime),
				selectedImages: [],
				enableTemplateAsSystemPrompt: this.parser.parseBoolean(frontmatter.enableTemplateAsSystemPrompt, false),
				multiModelMode: this.parser.parseMultiModelMode(frontmatter.multiModelMode),
				activeCompareGroupId: this.parser.parseOptionalString(frontmatter.activeCompareGroupId),
				layoutMode: this.parser.parseLayoutMode(frontmatter.layoutMode),
				livePlan: this.planResolver.resolveLivePlan(persistedPlan, messagePlan),
				contextCompaction: this.parser.parseContextCompaction(frontmatter.contextCompaction),
				requestTokenState: this.parser.parseRequestTokenState(frontmatter.requestTokenState),
				filePath, // 设置文件路径
			};
			return session;
		} catch (error) {
			console.error('[Chat][HistoryService] loadSession error', error);
			return null;
		}
	}

	async deleteSession(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			await this.app.vault.delete(file);
		}
	}

	async createNewSessionFile(session: ChatSession): Promise<string> {
		const folder = await this.ensureFolder();
		const fileName = `${sanitizeFileName(session.title || session.id)}.md`;
		const filePath = joinPath(folder.path, fileName);
		
		// 如果文件已存在，添加时间戳确保唯一性
		let finalFilePath = filePath;
		if (await this.app.vault.adapter.exists(filePath)) {
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
			const uniqueFileName = `${sanitizeFileName(session.title || session.id)}-${timestamp}.md`;
			finalFilePath = joinPath(folder.path, uniqueFileName);
		}
		
		const frontmatter = stringifyYaml({
			id: session.id,
			title: session.title,
			model: session.modelId,
			created: session.createdAt,
			updated: session.updatedAt,
			contextNotes: session.contextNotes ?? [],
			enableTemplateAsSystemPrompt: session.enableTemplateAsSystemPrompt ?? false,
			multiModelMode: session.multiModelMode ?? 'single',
			activeCompareGroupId: session.activeCompareGroupId,
			layoutMode: session.layoutMode,
			livePlan: clonePlanSnapshot(session.livePlan ?? null),
			contextCompaction: session.contextCompaction ?? null,
			requestTokenState: session.requestTokenState ?? null,
		});

		// 创建文件，只包含frontmatter，不包含任何消息
		const content = `${FRONTMATTER_DELIMITER}\n${frontmatter}${FRONTMATTER_DELIMITER}\n\n`;

		await this.app.vault.create(finalFilePath, content);
		return finalFilePath;
	}

	async appendMessageToFile(
		filePath: string, 
		message: ChatMessage, 
		selectedFiles?: SelectedFile[], 
		selectedFolders?: SelectedFolder[]
	): Promise<void> {
		if (!filePath) {
			throw new Error('文件路径为空，无法追加消息');
		}
		
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			throw new Error(`文件不存在: ${filePath}`);
		}

		// 读取当前文件内容
		const currentContent = await this.app.vault.read(file);
		
		// 序列化新消息，但不重复添加文件和文件夹信息（因为已经在消息内容中了）
		const serializedMessage = this.messageService.serializeMessage(message);
		
		// 追加新消息到文件末尾
		const newContent = currentContent.trimEnd() + '\n\n' + serializedMessage + '\n';
		
		// 更新文件内容
		await this.app.vault.modify(file, newContent);
		
		// 更新frontmatter中的updated时间和文件/文件夹信息
		await this.updateFileTimestamp(file, Date.now(), selectedFiles, selectedFolders);
	}

	async createNewSessionFileWithFirstMessage(
		session: ChatSession, 
		firstMessage: ChatMessage, 
		selectedFiles?: SelectedFile[], 
		selectedFolders?: SelectedFolder[]
	): Promise<string> {
		const folder = await this.ensureFolder();
		
		// 使用新的文件名生成规则
		const fileName = this.parser.generateHistoryFileName(firstMessage) + '.md';
		const filePath = joinPath(folder.path, fileName);
		
		// 如果文件已存在，添加额外时间戳确保唯一性
		let finalFilePath = filePath;
		if (await this.app.vault.adapter.exists(filePath)) {
			const extraTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
			const uniqueFileName = this.parser.generateHistoryFileName(firstMessage) + `-${extraTimestamp}.md`;
			finalFilePath = joinPath(folder.path, uniqueFileName);
		}
		
		const title = this.parser.deriveSessionTitle(firstMessage);
		
		const fileTags = selectedFiles ? selectedFiles.map(f => `[[${f.name}]]`) : [];
		const folderTags = selectedFolders ? selectedFolders.map(f => f.path) : [];
		const updatedContextNotes = [...(session.contextNotes || []), ...fileTags, ...folderTags];
		
		const frontmatter = stringifyYaml({
			id: session.id,
			title,
			model: session.modelId,
			created: this.parser.formatTimestamp(session.createdAt),
			updated: this.parser.formatTimestamp(session.updatedAt),
			messageCount: 1,
			contextNotes: updatedContextNotes,
			enableTemplateAsSystemPrompt: session.enableTemplateAsSystemPrompt ?? false,
			multiModelMode: session.multiModelMode ?? 'single',
			activeCompareGroupId: session.activeCompareGroupId,
			layoutMode: session.layoutMode,
			livePlan: clonePlanSnapshot(session.livePlan ?? null),
			contextCompaction: session.contextCompaction ?? null,
			requestTokenState: session.requestTokenState ?? null,
		});

		// 序列化第一条消息，但不重复添加文件和文件夹信息（因为已经在消息内容中了）
		const serializedMessage = this.messageService.serializeMessage(firstMessage);
		
		// 创建文件，包含frontmatter和第一条消息
		const content = `${FRONTMATTER_DELIMITER}
${frontmatter}${FRONTMATTER_DELIMITER}

${serializedMessage}
`;

		await this.app.vault.create(finalFilePath, content);
		return finalFilePath;
	}

	async updateFileFrontmatter(file: TFile, updates: Record<string, unknown>): Promise<void> {
		const content = await this.app.vault.read(file);
		const { frontmatter, body } = this.parser.extractFrontmatter(content);

		if (!frontmatter) {
			console.warn('[HistoryService] 文件没有frontmatter，无法更新');
			return;
		}

		const updatedFrontmatter = { ...frontmatter, ...updates };

		if (Object.prototype.hasOwnProperty.call(updates, 'messages') || body !== undefined) {
			const messages = this.parser.parseMessages(body);
			updatedFrontmatter.messageCount = messages.length;
		}

		const newFrontmatter = stringifyYaml(updatedFrontmatter);
		const newContent = `${FRONTMATTER_DELIMITER}\n${newFrontmatter}${FRONTMATTER_DELIMITER}\n\n${body}`;

		await this.app.vault.modify(file, newContent);
	}

	async rewriteMessagesOnly(
		filePath: string,
		messages: ChatMessage[],
		livePlan?: PlanSnapshot | null
	): Promise<void> {
		if (!filePath) {
			throw new Error('文件路径为空，无法重写消息');
		}

		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			throw new Error(`文件不存在: ${filePath}`);
		}

		// 读取当前文件内容
		const content = await this.app.vault.read(file);
		const { frontmatter } = this.parser.extractFrontmatter(content);

		if (!frontmatter) {
			throw new Error('文件没有frontmatter，无法重写消息');
		}

		// 更新frontmatter中的时间戳和消息数量
		frontmatter.updated = this.parser.formatTimestamp(Date.now());
		frontmatter.messageCount = messages.length;
		// 同步更新 livePlan（如果传入了参数）
		if (livePlan !== undefined) {
			frontmatter.livePlan = clonePlanSnapshot(livePlan);
		}

		// 重新构建文件内容
		const newFrontmatter = stringifyYaml(frontmatter);
		const body = messages.map((message) => this.messageService.serializeMessage(message)).join('\n\n');
		const newContent = `${FRONTMATTER_DELIMITER}
${newFrontmatter}${FRONTMATTER_DELIMITER}

${body}
`;

		// 更新文件
		await this.app.vault.modify(file, newContent);
	}

	private async updateFileTimestamp(
		file: TFile, 
		timestamp: number, 
		selectedFiles?: SelectedFile[], 
		selectedFolders?: SelectedFolder[]
	): Promise<void> {
		// 创建文件和文件夹标签数组
		const fileTags = selectedFiles ? selectedFiles.map(file => `[[${file.name}]]`) : []; // 只使用文件名，不使用路径
		const folderTags = selectedFolders ? selectedFolders.map(folder => folder.path) : []; // 不添加#符号
		const allTags = [...fileTags, ...folderTags];
		
		// 准备更新对象
		const updates: Record<string, unknown> = {
			updated: this.parser.formatTimestamp(timestamp)
		};
		
		// 如果有文件或文件夹标签，更新contextNotes
		if (allTags.length > 0) {
			// 读取当前frontmatter
			const content = await this.app.vault.read(file);
			const { frontmatter } = this.parser.extractFrontmatter(content);
			
			if (frontmatter) {
				// 获取现有的contextNotes
				const existingContextNotes = (frontmatter.contextNotes as string[]) || [];
				// 添加新的标签
				const updatedContextNotes = [...existingContextNotes, ...allTags];
				updates.contextNotes = updatedContextNotes;
			}
		}
		
		await this.updateFileFrontmatter(file, updates);
	}

	async updateSessionFrontmatter(filePath: string, updates: Record<string, unknown>): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			throw new Error(`文件不存在: ${filePath}`);
		}
		await this.updateFileFrontmatter(file, updates);
	}

	private async ensureFolder(): Promise<TFolder> {
		return ensureFolderExists(this.app, this.folderPath);
	}
}