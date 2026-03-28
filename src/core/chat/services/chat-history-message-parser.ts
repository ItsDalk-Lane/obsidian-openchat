import { DebugLogger } from 'src/utils/DebugLogger';
import type { ChatMessage, ChatRole } from '../types/chat';
import type { MessageService } from './message-service';
import { parseChatHistoryTimestamp } from './chat-history-parser-support';

const MESSAGE_HEADER_REGEX =
	/^#\s+(用户|AI|系统)(?:\s+\[([^\]]+)\])?\s*(?:\(([^)]+)\))?\s*$/gm;
const INLINE_MESSAGE_HEADER_REGEX =
	/^#\s+(用户|AI|系统)(?:\s+\[([^\]]+)\])?\s*(?:\(([^)]+)\))?\s*$/;
const AGENT_EVENTS_REGEX =
	/<!-- FF_AGENT_EVENTS_START -->[\s\S]*?<!-- FF_AGENT_EVENTS_END -->\n?/g;
const IMAGE_BLOCK_REGEX = /!\[Image \d+\]\(([^)]+)\)/g;
const PINNED_REGEX = /\n\n> 置顶:\s*(true|false)$/mi;

interface HistoryHeaderMatch {
	index: number;
	header: string;
	role: ChatRole;
	timestampStr: string;
	modelTag?: string;
}

const resolveHeaderRole = (label: string): ChatRole => {
	if (label === 'AI') {
		return 'assistant';
	}
	return label === '系统' ? 'system' : 'user';
};

const collectHeaderMatches = (body: string): HistoryHeaderMatch[] => {
	const matches: HistoryHeaderMatch[] = [];
	for (const match of body.matchAll(MESSAGE_HEADER_REGEX)) {
		const roleLabel = match[1]?.trim() ?? '';
		const modelTag = match[2]?.trim() ?? '';
		const timestampStr = match[3]?.trim() ?? '';
		matches.push({
			index: match.index ?? 0,
			header: match[0],
			role: resolveHeaderRole(roleLabel),
			timestampStr,
			modelTag: modelTag || undefined,
		});
	}
	return matches;
};

const extractMessageContent = (
	messageService: MessageService,
	content: string,
): {
	content: string;
	toolCalls: ChatMessage['toolCalls'];
	subAgentStates?: ChatMessage['metadata'] extends { subAgentStates?: infer T } ? T : never;
} => {
	let nextContent = content.replace(AGENT_EVENTS_REGEX, '').trim();
	nextContent = messageService.parseReasoningBlocksFromHistory(nextContent);
	const extracted = messageService.extractToolCallsFromHistory(nextContent);
	nextContent = messageService.parseMcpToolBlocksFromHistory(extracted.content);
	const subAgentResult = messageService.parseSubAgentStatesFromHistory(nextContent);
	nextContent = subAgentResult.cleanedContent.replace(/\n{3,}/g, '\n\n').trim();
	return {
		content: nextContent,
		toolCalls: extracted.toolCalls,
		subAgentStates: Object.keys(subAgentResult.subAgentStates).length > 0
			? subAgentResult.subAgentStates
			: undefined,
	};
};

const extractMessageMetadata = (content: string): {
	content: string;
	taskDescription?: string;
	modelName?: string;
	executionIndex?: number;
	parallelGroupId?: string;
	pinned: boolean;
	isError: boolean;
	images: string[];
} => {
	let nextContent = content;
	const images = Array.from(nextContent.matchAll(IMAGE_BLOCK_REGEX), (match) => match[1] ?? '')
		.filter(Boolean);
	nextContent = nextContent.replace(/!\[Image \d+\]\([^)]+\)\n?/g, '').trim();
	const pinnedMatch = nextContent.match(PINNED_REGEX);
	const pinned = pinnedMatch?.[1]?.trim().toLowerCase() === 'true';
	if (pinned) {
		nextContent = nextContent.replace(PINNED_REGEX, '').trim();
	}
	const readQuotedLine = (label: string): string | undefined => {
		const match = nextContent.match(new RegExp(`\\n\\n> ${label}:\\s*(.+)$`, 'm'));
		if (!match?.[1]) {
			return undefined;
		}
		nextContent = nextContent.replace(new RegExp(`\\n\\n> ${label}:\\s*.+$`, 'm'), '').trim();
		return match[1].trim();
	};
	const executionIndexValue = readQuotedLine('执行序号');
	const isError = nextContent.startsWith('[错误]');
	if (isError) {
		nextContent = nextContent.replace(/^\[错误\]\s*/, '').trim();
	}
	return {
		content: nextContent,
		taskDescription: readQuotedLine('任务'),
		modelName: readQuotedLine('模型名称'),
		executionIndex: executionIndexValue ? Number(executionIndexValue) : undefined,
		parallelGroupId: readQuotedLine('对比组'),
		pinned,
		isError,
		images,
	};
};

export const parseChatHistoryMessages = (
	messageService: MessageService,
	body: string,
): ChatMessage[] => {
	if (!body.trim()) {
		return [];
	}
	const headers = collectHeaderMatches(body);
	const messages = headers.map((header, index) => {
		const nextHeader = headers[index + 1];
		const contentStart = header.index + header.header.length;
		const contentEnd = nextHeader ? nextHeader.index : body.length;
		const parsedContent = extractMessageContent(
			messageService,
			body.substring(contentStart, contentEnd).trim(),
		);
		const extracted = extractMessageMetadata(parsedContent.content);
		const timestamp = header.timestampStr
			? parseChatHistoryTimestamp(header.timestampStr) || Date.now()
			: Date.now();
		return messageService.createMessage(header.role, extracted.content, {
			timestamp,
			images: extracted.images,
			modelTag: header.modelTag,
			modelName: extracted.modelName ?? header.modelTag,
			taskDescription: extracted.taskDescription,
			executionIndex: extracted.executionIndex,
			parallelGroupId: extracted.parallelGroupId,
			isError: extracted.isError,
			toolCalls: parsedContent.toolCalls,
			metadata: {
				hiddenFromModel:
					header.role === 'assistant' && Boolean(extracted.parallelGroupId),
				originalHeader: header.header.trim(),
				originalTimestamp: header.timestampStr,
				...(extracted.pinned ? { pinned: true } : {}),
				...(parsedContent.subAgentStates
					? { subAgentStates: parsedContent.subAgentStates }
					: {}),
			},
		});
	});
	if (messages.length > 0) {
		return messages;
	}
	DebugLogger.warn('[ChatHistoryParser] 使用更宽松的解析方式');
	let currentRole: ChatRole = 'user';
	let currentModelTag: string | undefined;
	let currentMessage = '';
	let inMessage = false;
	const currentTimestamp = Date.now();
	const fallbackMessages: ChatMessage[] = [];
	const flushMessage = () => {
		if (!inMessage || !currentMessage.trim()) {
			return;
		}
		const parsed = extractMessageContent(messageService, currentMessage.trim());
		const extracted = extractMessageMetadata(parsed.content);
		fallbackMessages.push(messageService.createMessage(currentRole, extracted.content, {
			timestamp: currentTimestamp,
			modelTag: currentModelTag,
			modelName: extracted.modelName ?? currentModelTag,
			toolCalls: parsed.toolCalls,
			metadata: extracted.pinned ? { pinned: true } : {},
		}));
	};
	for (const line of body.split('\n')) {
		const headerLineMatch = line.match(INLINE_MESSAGE_HEADER_REGEX);
		if (headerLineMatch) {
			flushMessage();
			currentRole = resolveHeaderRole(headerLineMatch[1]?.trim() ?? '');
			currentModelTag = headerLineMatch[2]?.trim() || undefined;
			currentMessage = '';
			inMessage = true;
			continue;
		}
		if (inMessage) {
			currentMessage += `${line}\n`;
		}
	}
	flushMessage();
	return fallbackMessages;
};
