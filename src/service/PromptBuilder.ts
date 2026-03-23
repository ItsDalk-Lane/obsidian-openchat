import type { App, EmbedCache } from 'obsidian';
import type { Message as ProviderMessage } from 'src/features/tars/providers';
import type { ChatMessage, SelectedFile, SelectedFolder, FileIntentAnalysis } from 'src/features/chat/types/chat';
import type { FileContentOptions, FileContentService, FileContent } from 'src/features/chat/services/FileContentService';
import { FileIntentAnalyzer } from 'src/features/chat/services/FileIntentAnalyzer';
import { parseContentBlocks } from 'src/features/chat/utils/markdown';

export const DEFAULT_HISTORY_ROUNDS = 10;

export const composeChatSystemPrompt =(params: {
	configuredSystemPrompt?: string;
	livePlanGuidance?: string | null;
	skillsPromptBlock?: string | null;
}): string | undefined => {
	const layers = [
		params.configuredSystemPrompt,
		params.livePlanGuidance ?? undefined,
		params.skillsPromptBlock ?? undefined,
	]
		.map((value) => value?.trim())
		.filter((value): value is string => Boolean(value));

	return layers.length > 0 ? layers.join('\n\n') : undefined;
}

export interface PromptBuilderChatContext {
	systemPrompt?: string;
	contextNotes?: string[];
	selectedFiles?: SelectedFile[];
	selectedFolders?: SelectedFolder[];
	fileContentOptions?: FileContentOptions;
	sourcePath?: string;
	maxHistoryRounds?: number;
	prebuiltContextMessage?: ProviderMessage | null;
	/** 任务模板内容，用于智能判断文件角色 */
	taskTemplate?: string;
	/** 是否启用智能文件角色判断 */
	enableFileIntentAnalysis?: boolean;
}

export interface PromptBuilderContextMessageParams {
	selectedFiles: SelectedFile[];
	selectedFolders: SelectedFolder[];
	contextNotes: string[];
	selectedText: string | null;
	fileContentOptions?: FileContentOptions;
	sourcePath: string;
	embeds?: EmbedCache[];
	images?: string[];
}

export class PromptBuilder {
	private readonly intentAnalyzer: FileIntentAnalyzer;

	constructor(
		private readonly app: App,
		private readonly fileContentService?: FileContentService
	) {
		this.intentAnalyzer = new FileIntentAnalyzer();
	}

	/**
	 * Chat: 将会话消息 + 系统提示词 + 文件上下文，组装成最终发送给 provider 的消息序列。
	 * 顺序：System -> Context(User/XML) -> History(截断) -> Task(当前输入)
	 */
	async buildChatProviderMessages(messages: ChatMessage[], ctx?: PromptBuilderChatContext): Promise<ProviderMessage[]> {
		let systemPrompt = ctx?.systemPrompt;
		const contextNotes = ctx?.contextNotes ?? [];
		const selectedFiles = ctx?.selectedFiles ?? [];
		const selectedFolders = ctx?.selectedFolders ?? [];
		const fileContentOptions = ctx?.fileContentOptions;
		const sourcePath = ctx?.sourcePath ?? this.app.workspace.getActiveFile()?.path ?? '';
		const maxHistoryRounds = ctx?.maxHistoryRounds ?? DEFAULT_HISTORY_ROUNDS;
		const prebuiltContextMessage = ctx?.prebuiltContextMessage;
		const taskTemplate = ctx?.taskTemplate;
		const enableFileIntentAnalysis = ctx?.enableFileIntentAnalysis ?? true;

		const result: ProviderMessage[] = [];

		// 智能文件角色判断：分析任务模板，生成文件处理指导
		const hasFiles = selectedFiles.length > 0 || selectedFolders.length > 0;
		if (enableFileIntentAnalysis && hasFiles && taskTemplate && systemPrompt) {
			const analysis = this.intentAnalyzer.analyzePromptIntent(taskTemplate);
			const fileRoleGuidance = this.buildFileRoleGuidance(analysis);
			if (fileRoleGuidance) {
				systemPrompt = systemPrompt + '\n\n' + fileRoleGuidance;
			}
		}

		// 1) System
		if (systemPrompt && systemPrompt.trim().length > 0) {
			result.push({ role: 'system', content: systemPrompt });
		}

		// 3) History + 4) Task
		const nonSystemMessages = messages.filter((m) => m.role !== 'system');
		if (nonSystemMessages.length === 0) {
			return result;
		}

		const last = nonSystemMessages[nonSystemMessages.length - 1];
		const isLastUser = last.role === 'user';

		// 2) Context (User/XML)
		// - 文件/文件夹（由 UI 手动或自动添加）
		// - 选中文本/符号触发全文（来自最后一次用户输入的 metadata.selectedText）
		// - 图片：仅当存在其他上下文内容（文件/文本）时才归入 Context，
		//   否则保留在 Task 消息中，避免图片与用户问题分属不同消息导致模型无法关联
		const selectedText = isLastUser ? this.getStringMetadata(last, 'selectedText') : null;
		const hasContextData = selectedFiles.length > 0
			|| selectedFolders.length > 0
			|| contextNotes.some((n) => (n ?? '').trim().length > 0)
			|| (selectedText != null && selectedText.trim().length > 0);

		const imageEmbeds = isLastUser ? this.createEmbedsFromImages(last.images ?? []) : [];
		// 图片归入 Context 还是 Task：有其他上下文时归入 Context，否则留在 Task
		const contextEmbeds = hasContextData ? imageEmbeds : [];
		const taskEmbeds = hasContextData ? [] : imageEmbeds;

		const contextMessage = prebuiltContextMessage
			?? await this.buildChatContextMessage({
				selectedFiles,
				selectedFolders,
				contextNotes,
				selectedText,
				fileContentOptions,
				sourcePath,
				embeds: contextEmbeds
			});
		if (contextMessage) {
			result.push(contextMessage);
		}

		const history = isLastUser ? nonSystemMessages.slice(0, -1) : nonSystemMessages;
		const trimmedHistory = this.trimHistory(history, maxHistoryRounds);

		for (const message of trimmedHistory) {
			result.push(await this.mapChatMessageToProviderMessage(message));
		}

		if (isLastUser) {
			// Task 消息：清除原始 images（改用已构建的 embeds 直接注入）
			const taskMessage: ChatMessage = {
				...last,
				images: []
			};
			const taskProviderMsg = await this.mapChatMessageToProviderMessage(taskMessage);
			// 注入图片 embeds（当图片未归入 Context 时）
			if (taskEmbeds.length > 0) {
				result.push({
					...taskProviderMsg,
					embeds: taskEmbeds
				});
			} else {
				result.push(taskProviderMsg);
			}
		}

		return result;
	}

	/**
	 * Action: 统一组装 system + user 消息（用于 AIActionService 等非聊天链路）。
	 */
	buildActionProviderMessages(systemPrompt: string | null, userPrompt: string): ProviderMessage[] {
		const result: ProviderMessage[] = [];
		if (systemPrompt && systemPrompt.trim().length > 0) {
			result.push({ role: 'system', content: systemPrompt });
		}
		result.push({ role: 'user', content: userPrompt });
		return result;
	}

	/**
	 * History 截断：仅对中间 History 层做截断，保留最近 N 轮（2N 条消息）。
	 */
	trimHistory(messages: ChatMessage[], maxRounds: number): ChatMessage[] {
		const safeMaxRounds = Number.isFinite(maxRounds) && maxRounds > 0 ? Math.floor(maxRounds) : DEFAULT_HISTORY_ROUNDS;
		const maxMessages = safeMaxRounds * 2;
		if (messages.length <= maxMessages) {
			return messages;
		}
		return messages.slice(messages.length - maxMessages);
	}

	async buildChatContextMessage(
		params: PromptBuilderContextMessageParams
	): Promise<ProviderMessage | null> {
		const embeds = params.embeds ?? this.createEmbedsFromImages(params.images ?? []);
		const documents: Array<{ source: string; content: string }> = [];

		// 1) 附加上下文备注
		for (const note of params.contextNotes) {
			const trimmed = (note ?? '').trim();
			if (!trimmed) {
				continue;
			}
			documents.push({ source: 'context_note', content: trimmed });
		}

		// 2) 选中文本 / 符号触发全文
		if (params.selectedText && params.selectedText.trim().length > 0) {
			documents.push({ source: 'selected_text', content: params.selectedText });
		}

		// 3) 文件/文件夹内容
		if (this.fileContentService) {
			const files: FileContent[] = [];

			if (params.selectedFiles.length > 0) {
				const fileContents = await this.fileContentService.readFilesContent(params.selectedFiles, params.fileContentOptions);
				files.push(...fileContents);
			}

			if (params.selectedFolders.length > 0) {
				const folderContents = await this.fileContentService.readFoldersContent(params.selectedFolders, params.fileContentOptions);
				for (const folder of folderContents) {
					files.push(...folder.files);
				}
			}

			for (const file of files) {
				documents.push({ source: file.path, content: file.content ?? '' });
			}
		}

		const hasDocs = documents.length > 0;
		const hasEmbeds = embeds.length > 0;
		if (!hasDocs && !hasEmbeds) {
			return null;
		}

		const xml = this.formatDocumentsAsXml(documents);
		return {
			role: 'user',
			content: xml,
			embeds: hasEmbeds ? embeds : undefined
		};
	}

	private formatDocumentsAsXml(documents: Array<{ source: string; content: string }>): string {
		let index = 1;
		let xml = '<documents>\n';

		for (const doc of documents) {
			const source = this.escapeXml(doc.source);
			const content = this.escapeXml(doc.content ?? '');
			xml += `  <document index="${index}">\n`;
			xml += `    <source>${source}</source>\n`;
			xml += '    <document_content>\n';
			xml += `${content}\n`;
			xml += '    </document_content>\n';
			xml += '  </document>\n';
			index += 1;
		}

		xml += '</documents>';
		return xml;
	}

	private escapeXml(text: string): string {
		return String(text)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&apos;');
	}

	private async mapChatMessageToProviderMessage(message: ChatMessage): Promise<ProviderMessage> {
		const embeds = this.createEmbedsFromImages(message.images ?? []);

		let messageContent = message.content;
		let reasoningContent: string | undefined;

		if (message.role === 'user') {
			const taskUserInput = this.getStringMetadata(message, 'taskUserInput');
			const taskTemplate = this.getStringMetadata(message, 'taskTemplate');

			if (taskUserInput !== null) {
				const structuredTask = this.buildChatTaskContent({
					userInput: taskUserInput,
					template: taskTemplate,
				});
				messageContent = structuredTask;
			} else if (message.metadata?.parsedContent && typeof message.metadata.parsedContent === 'string') {
				messageContent = message.metadata.parsedContent;
			}
		} else if (message.role === 'assistant') {
			// 对于 assistant 消息，提取推理内容和普通文本内容
			const blocks = parseContentBlocks(messageContent);
			const reasoningBlocks = blocks.filter(b => b.type === 'reasoning');
			const replayableBlocks = blocks.filter((block) => block.type !== 'reasoning');

			if (reasoningBlocks.length > 0) {
				// 合并所有推理内容
				reasoningContent = reasoningBlocks.map(b => b.content).join('\n');
				// 保留普通文本和工具块，仅剥离 reasoning
				messageContent = replayableBlocks.map((block) => {
					if (block.type === 'mcpTool') {
						return `{{FF_MCP_TOOL_START}}:${block.toolName}:${block.content}{{FF_MCP_TOOL_END}}:`;
					}
					return block.content;
				}).join('');
			}

			// 处理 parsedContent
			if (message.metadata?.parsedContent && typeof message.metadata.parsedContent === 'string') {
				messageContent = message.metadata.parsedContent;
			}

		} else if (message.metadata?.parsedContent && typeof message.metadata.parsedContent === 'string') {
			messageContent = message.metadata.parsedContent;
		}

		const role = message.role === 'tool' ? 'assistant' : message.role;

		return {
			role,
			content: messageContent,
			embeds: embeds.length > 0 ? embeds : undefined,
			reasoning_content: reasoningContent
		};
	}

	private getStringMetadata(message: ChatMessage, key: string): string | null {
		const meta = message.metadata;
		if (!meta || typeof meta !== 'object') {
			return null;
		}
		const value = (meta as Record<string, unknown>)[key];
		return typeof value === 'string' ? value : null;
	}

	private buildChatTaskContent(params: {
		userInput: string;
		template: string | null;
	}): string {
		const rawUserInput = params.userInput ?? '';
		const template = params.template ?? '';
		const placeholderRegex = /\{\{\s*\}\}|\{\{\s*@[^}]+\}\}|\{\{\s*user_input\s*\}\}/;

		// Task 层：先做结构化组装
		let assembled: string;
		if (template && template.length > 0) {
			if (placeholderRegex.test(template)) {
				assembled = template.replace(placeholderRegex, rawUserInput);
			} else {
				assembled = `### 任务指令\n${template}\n\n### 用户输入\n${rawUserInput}`;
			}
		} else {
			assembled = rawUserInput;
		}

		return assembled;
	}

	private createEmbedsFromImages(imageBase64Array: string[]): EmbedCache[] {
		return imageBase64Array.map((imageBase64, index) => {
			let mimeType = 'image/png';
			let filename = `image-${index + 1}`;

			if (imageBase64.startsWith('data:')) {
				const mimeMatch = imageBase64.match(/data:([^;]+);/);
				if (mimeMatch) {
					mimeType = mimeMatch[1];
					const extension = this.getExtensionFromMimeType(mimeType);
					filename = `image-${index + 1}.${extension}`;
				}
			}

			return {
				link: filename,
				path: filename,
				[Symbol.for('originalBase64')]: imageBase64,
				[Symbol.for('mimeType')]: mimeType
			} as unknown as EmbedCache;
		});
	}

	private getExtensionFromMimeType(mimeType: string): string {
		const mimeToExt: Record<string, string> = {
			'image/png': 'png',
			'image/jpeg': 'jpg',
			'image/jpg': 'jpg',
			'image/gif': 'gif',
			'image/webp': 'webp',
			'image/svg+xml': 'svg',
			'image/bmp': 'bmp',
			'image/x-icon': 'ico'
		};
		return mimeToExt[mimeType] || 'png';
	}

	/**
	 * 根据文件意图分析结果，生成文件角色指导提示词
	 * 返回空字符串表示不需要额外指导
	 */
	private buildFileRoleGuidance(analysis: FileIntentAnalysis): string {
		// 仅对高置信度的 processing_target 生成指导
		// 其他角色（reference/example/context）使用系统提示词的默认行为
		if (analysis.role !== 'processing_target' || analysis.confidence === 'low') {
			return '';
		}

		return `<file_processing_guidance>
当前任务检测结果：文件为【待处理数据】（置信度：${analysis.confidence === 'high' ? '高' : '中'}）

处理指导：
- 用户提供的文件是需要分析和处理的**核心数据**
- 请立即对文件内容执行提示词要求的任务
- 不要等待用户额外的"请分析"指令
- 直接基于文件内容生成结果

当您收到以下结构时：
<documents>
  <document index="N">
    <source>文件路径</source>
    <document_content>文件内容...</document_content>
  </document>
</documents>

这些内容即是您需要处理的数据，请直接执行任务。
</file_processing_guidance>`;
	}

	/**
	 * 获取文件意图分析器实例（供外部使用）
	 */
	getIntentAnalyzer(): FileIntentAnalyzer {
		return this.intentAnalyzer;
	}

	/**
	 * Action: 构建用户提示词（从模板文件或自定义内容）
	 */
	async buildUserPrompt(params: {
		promptSource: string;
		templateFile?: string;
		customPrompt?: string | null;
		loadTemplateFile: (templatePath: string) => Promise<string>;
		processTemplate: (template: string) => Promise<string>;
	}): Promise<string> {
		let userPrompt: string;

		if (params.promptSource === 'template' && params.templateFile) {
			// PromptSourceType.TEMPLATE = "template"
			userPrompt = await params.loadTemplateFile(params.templateFile);
		} else if (params.promptSource === 'custom' && params.customPrompt) {
			// PromptSourceType.CUSTOM = "custom"
			userPrompt = await params.processTemplate(params.customPrompt);
		} else {
			throw new Error('提示词来源无效');
		}

		return userPrompt;
	}
}
