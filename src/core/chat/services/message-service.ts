import { v4 as uuidv4 } from 'uuid';
import type { App, EmbedCache } from 'obsidian';
import type { Message as ProviderMessage } from 'src/types/provider';
import type { ChatMessage, ChatRole, SelectedFile, SelectedFolder } from '../types/chat';
import type { ToolCall } from '../types/tools';
import { FileContentService, FileContentOptions } from './file-content-service';
import {
	PromptBuilder,
	type PromptBuilderContextMessageParams,
} from 'src/core/services/PromptBuilder';
import {
	extractToolCallsFromHistory,
	parseMcpToolBlocksFromHistory,
	parseReasoningBlocksFromHistory,
	parseSubAgentStatesFromHistory,
} from './message-history-parsing';
import { serializeHistoryMessage } from './message-history-formatting';

export class MessageService {
	constructor(private readonly app: App, private readonly fileContentService?: FileContentService) {}

	createMessage(role: ChatRole, content: string, extras?: Partial<ChatMessage>): ChatMessage {
		const now = Date.now();
		return {
			...extras,
			id: extras?.id ?? uuidv4(),
			role,
			content: content.trim(),
			timestamp: extras?.timestamp ?? now,
			images: extras?.images ?? [],
			isError: extras?.isError ?? false,
			metadata: extras?.metadata ?? {},
			toolCalls: extras?.toolCalls ?? []
		};
	}

	formatTimestamp(timestamp: number): string {
		const locale = this.resolveMomentLocale();
		const formatter = new Intl.DateTimeFormat(locale, {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		} as Intl.DateTimeFormatOptions);
		return formatter.format(new Date(timestamp)).replace(/\//g, '/');
	}

	private resolveMomentLocale(): string {
		const candidate = globalThis as Window & {
			moment?: { locale?: () => unknown };
		};
		const locale = candidate.moment?.locale?.();
		return typeof locale === 'string' && locale.trim().length > 0 ? locale : 'zh-CN';
	}

	async toProviderMessages(
		messages: ChatMessage[],
		options?: {
			contextNotes?: string[];
			systemPrompt?: string;
			selectedFiles?: SelectedFile[];
			selectedFolders?: SelectedFolder[];
			fileContentOptions?: FileContentOptions;
			sourcePath?: string;
			maxHistoryRounds?: number;
			prebuiltContextMessage?: ProviderMessage | null;
		}
	): Promise<ProviderMessage[]> {
		const {
			contextNotes = [],
			systemPrompt,
			selectedFiles = [],
			selectedFolders = [],
			fileContentOptions,
			sourcePath,
			maxHistoryRounds,
			prebuiltContextMessage,
		} = options ?? {};

		const promptBuilder = new PromptBuilder(this.app, this.fileContentService);
		return promptBuilder.buildChatProviderMessages(messages, {
			systemPrompt,
			contextNotes,
			selectedFiles,
			selectedFolders,
			fileContentOptions,
			sourcePath,
			maxHistoryRounds,
			prebuiltContextMessage,
		});
	}

	async buildContextProviderMessage(
		params: PromptBuilderContextMessageParams
	): Promise<ProviderMessage | null> {
		const promptBuilder = new PromptBuilder(this.app, this.fileContentService);
		return promptBuilder.buildChatContextMessage(params);
	}

	serializeMessage(message: ChatMessage, selectedFiles?: SelectedFile[], selectedFolders?: SelectedFolder[]): string {
		return serializeHistoryMessage(message, {
			selectedFiles,
			selectedFolders,
			formatTimestamp: (timestamp) => this.formatTimestamp(timestamp),
			mapRoleToLabel: (role) => this.mapRoleToLabel(role),
		});
	}

	public extractToolCallsFromHistory(content: string): { content: string; toolCalls?: ToolCall[] } {
		return extractToolCallsFromHistory(content);
	}
	public parseMcpToolBlocksFromHistory(content: string): string {
		return parseMcpToolBlocksFromHistory(content);
	}

	public parseReasoningBlocksFromHistory(content: string): string {
		return parseReasoningBlocksFromHistory(content);
	}

	public parseSubAgentStatesFromHistory(
		content: string
	): {
		cleanedContent: string;
		subAgentStates: Record<
			string,
			import('src/tools/sub-agents/types').SubAgentExecutionState
		>;
	} {
		return parseSubAgentStatesFromHistory(
			content,
			(role, text, extras) => this.createMessage(role, text, extras)
		);
	}

	private mapRoleToLabel(role: ChatRole): string {
		switch (role) {
			case 'assistant':
				return 'AI';
			case 'system':
				return '系统';
			default:
				return '用户';
		}
	}

	/**
	 * 从base64图片字符串数组创建EmbedCache对象数组
	 * @param imageBase64Array base64图片字符串数组
	 * @returns EmbedCache对象数组
	 * @deprecated Chat 消息拼装已迁移到 PromptBuilder，此方法保留用于向下兼容。
	 */
	private createEmbedsFromImages(imageBase64Array: string[]): EmbedCache[] {
		return imageBase64Array.map((imageBase64, index) => {
			// 从base64字符串中提取MIME类型
			let mimeType = 'image/png'; // 默认值
			let filename = `image-${index + 1}`;

			if (imageBase64.startsWith('data:')) {
				const mimeMatch = imageBase64.match(/data:([^;]+);/);
				if (mimeMatch) {
					mimeType = mimeMatch[1];
					const extension = this.getExtensionFromMimeType(mimeType);
					filename = `image-${index + 1}.${extension}`;
				}
			}

			// 创建虚拟的EmbedCache对象
			return {
				link: filename,
				path: filename,
				// 为了避免使用Obsidian的内部缓存，我们创建一个简单的对象
				// 实际的图片数据将在resolveEmbedAsBinary时从base64字符串中获取
				[Symbol.for('originalBase64')]: imageBase64,
				[Symbol.for('mimeType')]: mimeType
			} as unknown as EmbedCache;
		});
	}

	/**
	 * 从MIME类型获取文件扩展名
	 * @param mimeType MIME类型
	 * @returns 文件扩展名
	 */
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
}
