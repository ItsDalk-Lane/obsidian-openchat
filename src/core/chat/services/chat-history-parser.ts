import type { ObsidianApiProvider } from 'src/providers/providers.types';
import type {
	ChatContextCompactionState,
	ChatMessage,
	ChatRequestTokenState,
	ChatSession,
} from '../types/chat';
import { MessageService } from './message-service';
import {
	deriveHistorySessionTitle,
	extractHistoryFrontmatter,
	formatChatHistoryTimestamp,
	formatChatHistoryTimestampForFileName,
	generateHistoryFileName,
	parseChatHistoryBoolean,
	parseChatHistoryContextCompaction,
	parseChatHistoryRequestTokenState,
	parseChatHistoryTimestamp,
	parseHistoryLayoutMode,
	parseHistoryMultiModelMode,
	parseOptionalHistoryString,
	sanitizeHistoryTitle,
} from './chat-history-parser-support';
import { parseChatHistoryMessages } from './chat-history-message-parser';

/**
 * 聊天历史解析器：负责 Markdown 内容的序列化/反序列化逻辑。
 * 包含消息解析、frontmatter 解析、文件名生成等纯解析职责。
 */
export class ChatHistoryParser {
	constructor(
		private readonly messageService: MessageService,
		private readonly obsidianApi: Pick<ObsidianApiProvider, 'parseYaml'>,
	) {}

	/**
	 * 格式化时间戳为 YYYY-MM-DD HH:mm:ss 格式
	 */
	formatTimestamp(timestamp: number): string {
		return formatChatHistoryTimestamp(timestamp);
	}

	/**
	 * 格式化时间戳为 YYYYMMDDHHmmss 格式（用于文件名后缀）
	 */
	formatTimestampForFilename(timestamp: number): string {
		return formatChatHistoryTimestampForFileName(timestamp);
	}

	/**
	 * 解析时间戳（支持数字和字符串格式）
	 */
	parseTimestamp(value: unknown): number {
		return parseChatHistoryTimestamp(value);
	}

	parseBoolean(value: unknown, fallback = false): boolean {
		return parseChatHistoryBoolean(value, fallback);
	}

	parseOptionalString(value: unknown): string | undefined {
		return parseOptionalHistoryString(value);
	}

	parseContextCompaction(value: unknown): ChatContextCompactionState | null {
		return parseChatHistoryContextCompaction(value);
	}

	parseRequestTokenState(value: unknown): ChatRequestTokenState | null {
		return parseChatHistoryRequestTokenState(value);
	}

	parseMultiModelMode(value: unknown): ChatSession['multiModelMode'] {
		return parseHistoryMultiModelMode(value);
	}

	parseLayoutMode(value: unknown): ChatSession['layoutMode'] {
		return parseHistoryLayoutMode(value);
	}

	/**
	 * 清理文本，使其适合作为文件名
	 */
	sanitizeTitle(text: string): string {
		return sanitizeHistoryTitle(text);
	}

	/**
	 * 从第一条消息推导会话标题（用于 frontmatter title 字段）
	 */
	deriveSessionTitle(firstMessage: ChatMessage): string {
		return deriveHistorySessionTitle(firstMessage);
	}

	/**
	 * 生成历史记录文件名，格式：{title}-{YYYYMMDDHHmmss}
	 */
	generateHistoryFileName(firstMessage: ChatMessage): string {
		return generateHistoryFileName(firstMessage);
	}

	/**
	 * 从 Markdown 文件内容中提取 frontmatter 和正文
	 */
	extractFrontmatter(content: string): { frontmatter: Record<string, unknown> | null; body: string } {
		return extractHistoryFrontmatter(content, this.obsidianApi.parseYaml);
	}

	/**
	 * 将 Markdown 正文解析为聊天消息数组
	 */
	parseMessages(body: string): ChatMessage[] {
		return parseChatHistoryMessages(this.messageService, body);
	}
}
