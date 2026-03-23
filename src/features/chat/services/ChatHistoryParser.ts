import { parseYaml } from 'obsidian';
import type {
	ChatContextCompactionState,
	ChatMessage,
	ChatRequestTokenState,
	ChatRole,
	ChatSession,
} from '../types/chat';
import { MessageService } from './MessageService';

const FRONTMATTER_DELIMITER = '---';

/**
 * 聊天历史解析器：负责 Markdown 内容的序列化/反序列化逻辑。
 * 包含消息解析、frontmatter 解析、文件名生成等纯解析职责。
 */
export class ChatHistoryParser {
	constructor(private readonly messageService: MessageService) {}

	/**
	 * 格式化时间戳为 YYYY-MM-DD HH:mm:ss 格式
	 */
	formatTimestamp(timestamp: number): string {
		const date = new Date(timestamp);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const seconds = String(date.getSeconds()).padStart(2, '0');

		return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
	}

	/**
	 * 格式化时间戳为 YYYYMMDDHHmmss 格式（用于文件名后缀）
	 */
	formatTimestampForFilename(timestamp: number): string {
		const date = new Date(timestamp);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const seconds = String(date.getSeconds()).padStart(2, '0');

		return `${year}${month}${day}${hours}${minutes}${seconds}`;
	}

	/**
	 * 解析时间戳（支持数字和字符串格式）
	 */
	parseTimestamp(value: unknown): number {
		if (typeof value === 'number') return value;
		if (typeof value === 'string' && value.trim()) {
			const match = value.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/);
			if (match) {
				const [_, year, month, day, hour, minute, second] = match.map(Number);
				return new Date(year, month - 1, day, hour, minute, second).getTime();
			}
		}
		return 0;
	}

	parseBoolean(value: unknown, fallback = false): boolean {
		if (typeof value === 'boolean') return value;
		if (typeof value === 'string') {
			const normalized = value.trim().toLowerCase();
			if (normalized === 'true') return true;
			if (normalized === 'false') return false;
		}
		return fallback;
	}

	parseOptionalString(value: unknown): string | undefined {
		return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
	}

	parseContextCompaction(value: unknown): ChatContextCompactionState | null {
		if (!value || typeof value !== 'object') {
			return null;
		}

		const raw = value as Record<string, unknown>;
		const coveredRange =
			raw.coveredRange && typeof raw.coveredRange === 'object'
				? (raw.coveredRange as Record<string, unknown>)
				: null;
		if (
			typeof raw.version !== 'number'
			|| !coveredRange
			|| typeof raw.summary !== 'string'
			|| typeof raw.historyTokenEstimate !== 'number'
			|| typeof raw.updatedAt !== 'number'
			|| typeof raw.droppedReasoningCount !== 'number'
		) {
			return null;
		}

		const endMessageId = coveredRange.endMessageId;
		if (
			(endMessageId !== null && typeof endMessageId !== 'string')
			|| typeof coveredRange.messageCount !== 'number'
			|| typeof coveredRange.signature !== 'string'
		) {
			return null;
		}

		if (
			('contextSummary' in raw && raw.contextSummary !== undefined && typeof raw.contextSummary !== 'string')
			|| ('contextSourceSignature' in raw
				&& raw.contextSourceSignature !== undefined
				&& typeof raw.contextSourceSignature !== 'string')
			|| ('contextTokenEstimate' in raw
				&& raw.contextTokenEstimate !== undefined
				&& typeof raw.contextTokenEstimate !== 'number')
			|| ('totalTokenEstimate' in raw
				&& raw.totalTokenEstimate !== undefined
				&& typeof raw.totalTokenEstimate !== 'number')
			|| ('overflowedProtectedLayers' in raw
				&& raw.overflowedProtectedLayers !== undefined
				&& typeof raw.overflowedProtectedLayers !== 'boolean')
		) {
			return null;
		}

		return JSON.parse(JSON.stringify(raw)) as ChatContextCompactionState;
	}

	parseRequestTokenState(value: unknown): ChatRequestTokenState | null {
		if (!value || typeof value !== 'object') {
			return null;
		}

		const raw = value as Record<string, unknown>;
		if (
			typeof raw.totalTokenEstimate !== 'number'
			|| typeof raw.messageTokenEstimate !== 'number'
			|| typeof raw.toolTokenEstimate !== 'number'
			|| typeof raw.updatedAt !== 'number'
		) {
			return null;
		}

		if (
			'userTurnTokenEstimate' in raw
			&& raw.userTurnTokenEstimate !== undefined
			&& typeof raw.userTurnTokenEstimate !== 'number'
		) {
			return null;
		}

		return JSON.parse(JSON.stringify(raw)) as ChatRequestTokenState;
	}

	parseMultiModelMode(value: unknown): ChatSession['multiModelMode'] {
		if (value === 'compare' || value === 'single') {
			return value;
		}
		if (value === 'collaborate') {
			return 'single';
		}
		return undefined;
	}

	parseLayoutMode(value: unknown): ChatSession['layoutMode'] {
		return value === 'horizontal' || value === 'tabs' || value === 'vertical'
			? value
			: undefined;
	}

	/**
	 * 清理文本，使其适合作为文件名
	 */
	sanitizeTitle(text: string): string {
		return text
			.replace(/\s+/g, '_')
			.replace(/[<>:"/\\|?*\x00-\x1f\x7f-\x9f]/g, '_')
			.replace(/_+/g, '_')
			.replace(/^_|_$/g, '');
	}

	/**
	 * 将标题截断至不超过 maxBytes 字节（UTF-8），超出时追加省略号
	 */
	private truncateTitleToBytes(title: string, maxBytes: number): string {
		const encoder = new TextEncoder();
		if (encoder.encode(title).length <= maxBytes) {
			return title;
		}

		let truncated = title;
		for (let i = 0; i < title.length; i++) {
			if (encoder.encode(title.substring(0, i + 1)).length > maxBytes) {
				truncated = title.substring(0, i);
				break;
			}
		}

		const ellipsis = '...';
		let withEllipsis = truncated + ellipsis;
		while (truncated.length > 0 && encoder.encode(withEllipsis).length > maxBytes) {
			truncated = truncated.substring(0, truncated.length - 1);
			withEllipsis = truncated + ellipsis;
		}
		return withEllipsis;
	}

	/**
	 * 从第一条消息推导会话标题（用于 frontmatter title 字段）
	 */
	deriveSessionTitle(firstMessage: ChatMessage): string {
		let title = firstMessage.content.trim();
		title = this.sanitizeTitle(title);
		if (firstMessage.role === 'system' && !title) {
			title = '新对话';
		}
		return this.truncateTitleToBytes(title, 100);
	}

	/**
	 * 生成历史记录文件名，格式：{title}-{YYYYMMDDHHmmss}
	 */
	generateHistoryFileName(firstMessage: ChatMessage): string {
		const title = this.deriveSessionTitle(firstMessage);
		const timestamp = this.formatTimestampForFilename(firstMessage.timestamp);
		return `${title}-${timestamp}`;
	}

	/**
	 * 从 Markdown 文件内容中提取 frontmatter 和正文
	 */
	extractFrontmatter(content: string): { frontmatter: Record<string, unknown> | null; body: string } {
		if (!content.startsWith(FRONTMATTER_DELIMITER)) {
			return { frontmatter: null, body: content };
		}

		const secondDelimiterIndex = content.indexOf(FRONTMATTER_DELIMITER, FRONTMATTER_DELIMITER.length);
		if (secondDelimiterIndex === -1) {
			return { frontmatter: null, body: content };
		}

		const frontmatterBlock = content.substring(FRONTMATTER_DELIMITER.length, secondDelimiterIndex).trim();
		const body = content.substring(secondDelimiterIndex + FRONTMATTER_DELIMITER.length).trimStart();
		const parsed = parseYaml(frontmatterBlock) as Record<string, unknown>;
		return { frontmatter: parsed, body };
	}

	/**
	 * 将 Markdown 正文解析为聊天消息数组
	 */
	parseMessages(body: string): ChatMessage[] {
		if (!body || !body.trim()) {
			return [];
		}

		const messages: ChatMessage[] = [];

		const messageHeaderRegex = /^#\s+(用户|AI|系统)(?:\s+\[([^\]]+)\])?\s*(?:\(([^)]+)\))?\s*$/gm;

		const headerMatches: { index: number; header: string; role: ChatRole; timestampStr: string; modelTag?: string }[] = [];
		let match;

		while ((match = messageHeaderRegex.exec(body)) !== null) {
			const roleLabel = match[1]?.trim() ?? '';
			const modelTag = match[2]?.trim() ?? '';
			const timestampStr = match[3]?.trim() ?? '';

			let role: ChatRole;
			if (roleLabel === 'AI') {
				role = 'assistant';
			} else if (roleLabel === '系统') {
				role = 'system';
			} else {
				role = 'user';
			}

			headerMatches.push({
				index: match.index,
				header: match[0],
				role,
				timestampStr,
				modelTag: modelTag || undefined,
			});
		}

		for (let i = 0; i < headerMatches.length; i++) {
			const currentHeader = headerMatches[i];
			const nextHeader = headerMatches[i + 1];

			const contentStart = currentHeader.index + currentHeader.header.length;
			const contentEnd = nextHeader ? nextHeader.index : body.length;

			let content = body.substring(contentStart, contentEnd).trim();

			content = content.replace(/<!-- FF_AGENT_EVENTS_START -->[\s\S]*?<!-- FF_AGENT_EVENTS_END -->\n?/g, '').trim();

			content = this.messageService.parseReasoningBlocksFromHistory(content);

			const extracted = this.messageService.extractToolCallsFromHistory(content);
			content = extracted.content;

			content = this.messageService.parseMcpToolBlocksFromHistory(content);

			const subAgentResult = this.messageService.parseSubAgentStatesFromHistory(content);
			content = subAgentResult.cleanedContent;

			content = content.replace(/\n{3,}/g, '\n\n').trim();

			let timestamp = Date.now();
			if (currentHeader.timestampStr) {
				try {
					const dateMatch = currentHeader.timestampStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/);
					if (dateMatch) {
						const [_, year, month, day, hour, minute, second] = dateMatch.map(Number);
						timestamp = new Date(year, month - 1, day, hour, minute, second).getTime();
					}
				} catch (e) {
					console.warn('[ChatHistoryParser] 无法解析时间戳:', currentHeader.timestampStr, e);
				}
			}

			let taskDescription: string | undefined;
			const taskDescriptionMatch = content.match(/\n\n> 任务:\s*(.+)$/m);
			if (taskDescriptionMatch?.[1]) {
				taskDescription = taskDescriptionMatch[1].trim();
				content = content.replace(/\n\n> 任务:\s*.+$/m, '').trim();
			}

			let modelName: string | undefined;
			const modelNameMatch = content.match(/\n\n> 模型名称:\s*(.+)$/m);
			if (modelNameMatch?.[1]) {
				modelName = modelNameMatch[1].trim();
				content = content.replace(/\n\n> 模型名称:\s*.+$/m, '').trim();
			}

			let executionIndex: number | undefined;
			const executionIndexMatch = content.match(/\n\n> 执行序号:\s*(\d+)$/m);
			if (executionIndexMatch?.[1]) {
				executionIndex = Number(executionIndexMatch[1]);
				content = content.replace(/\n\n> 执行序号:\s*\d+$/m, '').trim();
			}

			let parallelGroupId: string | undefined;
			const parallelGroupMatch = content.match(/\n\n> 对比组:\s*(.+)$/m);
			if (parallelGroupMatch?.[1]) {
				parallelGroupId = parallelGroupMatch[1].trim();
				content = content.replace(/\n\n> 对比组:\s*.+$/m, '').trim();
			}

			let pinned = false;
			const pinnedMatch = content.match(/\n\n> 置顶:\s*(true|false)$/mi);
			if (pinnedMatch?.[1]) {
				pinned = pinnedMatch[1].trim().toLowerCase() === 'true';
				content = content.replace(/\n\n> 置顶:\s*(?:true|false)$/mi, '').trim();
			}

			let isError = false;
			if (content.startsWith('[错误]')) {
				isError = true;
				content = content.replace(/^\[错误\]\s*/, '').trim();
			}

			const images: string[] = [];
			const imageMatches = content.matchAll(/!\[Image \d+\]\(([^)]+)\)/g);
			for (const imgMatch of imageMatches) {
				if (imgMatch[1]) {
					images.push(imgMatch[1]);
				}
			}

			content = content.replace(/!\[Image \d+\]\([^)]+\)\n?/g, '').trim();

			const message = this.messageService.createMessage(currentHeader.role, content, {
				timestamp,
				images,
				modelTag: currentHeader.modelTag,
				modelName: modelName ?? currentHeader.modelTag,
				taskDescription,
				executionIndex,
				parallelGroupId,
				isError,
				toolCalls: extracted.toolCalls,
				metadata: {
					hiddenFromModel: currentHeader.role === 'assistant' && Boolean(parallelGroupId),
					originalHeader: currentHeader.header.trim(),
					originalTimestamp: currentHeader.timestampStr,
					...(pinned ? { pinned: true } : {}),
					...(Object.keys(subAgentResult.subAgentStates).length > 0
						? { subAgentStates: subAgentResult.subAgentStates }
						: {}),
				},
			});

			messages.push(message);
		}

		// 宽松回退解析：当严格解析未匹配到任何消息时使用
		if (messages.length === 0 && body.trim()) {
			console.warn('[ChatHistoryParser] 使用更宽松的解析方式');
			const lines = body.split('\n');
			let currentMessage = '';
			let currentRole: ChatRole = 'user';
			let currentTimestamp = Date.now();
			let currentModelTag: string | undefined;
			let inMessage = false;

			for (const line of lines) {
				const headerLineMatch = line.match(/^#\s+(用户|AI|系统)(?:\s+\[([^\]]+)\])?\s*(?:\(([^)]+)\))?\s*$/);
				if (headerLineMatch) {
					if (inMessage && currentMessage.trim()) {
						let content = currentMessage.trim();

						content = content.replace(/<!-- FF_AGENT_EVENTS_START -->[\s\S]*?<!-- FF_AGENT_EVENTS_END -->\n?/g, '').trim();
						content = this.messageService.parseReasoningBlocksFromHistory(content);
						const extracted = this.messageService.extractToolCallsFromHistory(content);
						content = extracted.content;
						content = this.messageService.parseMcpToolBlocksFromHistory(content);
						content = content.replace(/\n{3,}/g, '\n\n').trim();

						let pinned = false;
						const pinnedMatch = content.match(/\n\n> 置顶:\s*(true|false)$/mi);
						if (pinnedMatch?.[1]) {
							pinned = pinnedMatch[1].trim().toLowerCase() === 'true';
							content = content.replace(/\n\n> 置顶:\s*(?:true|false)$/mi, '').trim();
						}

						const message = this.messageService.createMessage(currentRole, content, {
							timestamp: currentTimestamp,
							modelTag: currentModelTag,
							modelName: currentModelTag,
							toolCalls: extracted.toolCalls,
							metadata: pinned ? { pinned: true } : {},
						});

						messages.push(message);
					}

					const roleLabel = headerLineMatch[1]?.trim() ?? '';
					if (roleLabel === 'AI') {
						currentRole = 'assistant';
					} else if (roleLabel === '系统') {
						currentRole = 'system';
					} else {
						currentRole = 'user';
					}
					currentModelTag = headerLineMatch[2]?.trim() || undefined;

					currentMessage = '';
					inMessage = true;
				} else if (inMessage) {
					currentMessage += line + '\n';
				}
			}

			if (inMessage && currentMessage.trim()) {
				let content = currentMessage.trim();
				content = this.messageService.parseReasoningBlocksFromHistory(content);
				content = this.messageService.parseMcpToolBlocksFromHistory(content);
				content = content.replace(/\n{3,}/g, '\n\n').trim();

				let pinned = false;
				const pinnedMatch = content.match(/\n\n> 置顶:\s*(true|false)$/mi);
				if (pinnedMatch?.[1]) {
					pinned = pinnedMatch[1].trim().toLowerCase() === 'true';
					content = content.replace(/\n\n> 置顶:\s*(?:true|false)$/mi, '').trim();
				}
				messages.push(this.messageService.createMessage(currentRole, content, {
					timestamp: currentTimestamp,
					modelTag: currentModelTag,
					modelName: currentModelTag,
					metadata: pinned ? { pinned: true } : {},
				}));
			}
		}

		return messages;
	}
}
