import type { ObsidianApiProvider } from 'src/providers/providers.types';
import type {
	ChatContextCompactionState,
	ChatMessage,
	ChatRequestTokenState,
	ChatSession,
} from '../types/chat';

const FRONTMATTER_DELIMITER = '---';
const TIMESTAMP_REGEX =
	/(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/;
const INVALID_HISTORY_TITLE_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);

const isControlCharacter = (codePoint: number): boolean => {
	return (codePoint >= 0x00 && codePoint <= 0x1f)
		|| (codePoint >= 0x7f && codePoint <= 0x9f);
};

const replaceInvalidHistoryTitleChars = (text: string): string => {
	return Array.from(text, (char) => {
		const codePoint = char.codePointAt(0);
		if (codePoint === undefined) {
			return char;
		}
		return INVALID_HISTORY_TITLE_CHARS.has(char) || isControlCharacter(codePoint)
			? '_'
			: char;
	}).join('');
};

export const formatChatHistoryTimestamp = (timestamp: number): string => {
	const date = new Date(timestamp);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');
	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const formatChatHistoryTimestampForFileName = (timestamp: number): string => {
	return formatChatHistoryTimestamp(timestamp)
		.replace(/[-:\s/]/g, '')
		.slice(0, 14);
};

export const parseChatHistoryTimestamp = (value: unknown): number => {
	if (typeof value === 'number') {
		return value;
	}
	if (typeof value !== 'string' || !value.trim()) {
		return 0;
	}
	const match = value.match(TIMESTAMP_REGEX);
	if (!match) {
		return 0;
	}
	const [, year, month, day, hour, minute, second] = match.map(Number);
	return new Date(year, month - 1, day, hour, minute, second).getTime();
};

export const parseChatHistoryBoolean = (
	value: unknown,
	fallback = false,
): boolean => {
	if (typeof value === 'boolean') {
		return value;
	}
	if (typeof value !== 'string') {
		return fallback;
	}
	const normalized = value.trim().toLowerCase();
	if (normalized === 'true') {
		return true;
	}
	if (normalized === 'false') {
		return false;
	}
	return fallback;
};

export const parseOptionalHistoryString = (
	value: unknown,
): string | undefined => {
	return typeof value === 'string' && value.trim().length > 0
		? value.trim()
		: undefined;
};

export const parseChatHistoryContextCompaction = (
	value: unknown,
): ChatContextCompactionState | null => {
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
		('contextSummary' in raw
			&& raw.contextSummary !== undefined
			&& typeof raw.contextSummary !== 'string')
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
};

export const parseChatHistoryRequestTokenState = (value: unknown): ChatRequestTokenState | null => {
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
};

export const parseHistoryMultiModelMode = (
	value: unknown,
): ChatSession['multiModelMode'] => {
	if (value === 'compare' || value === 'single') {
		return value;
	}
	if (value === 'collaborate') {
		return 'single';
	}
	return undefined;
};

export const parseHistoryLayoutMode = (
	value: unknown,
): ChatSession['layoutMode'] => {
	return value === 'horizontal' || value === 'tabs' || value === 'vertical'
		? value
		: undefined;
};

export const sanitizeHistoryTitle = (text: string): string => {
	return replaceInvalidHistoryTitleChars(
		text.replace(/\s+/g, '_'),
	)
		.replace(/_+/g, '_')
		.replace(/^_|_$/g, '');
};

const truncateTitleToBytes = (title: string, maxBytes: number): string => {
	const encoder = new TextEncoder();
	if (encoder.encode(title).length <= maxBytes) {
		return title;
	}
	let truncated = title;
	for (let index = 0; index < title.length; index += 1) {
		if (encoder.encode(title.slice(0, index + 1)).length > maxBytes) {
			truncated = title.slice(0, index);
			break;
		}
	}
	const ellipsis = '...';
	let withEllipsis = `${truncated}${ellipsis}`;
	while (truncated.length > 0 && encoder.encode(withEllipsis).length > maxBytes) {
		truncated = truncated.slice(0, -1);
		withEllipsis = `${truncated}${ellipsis}`;
	}
	return withEllipsis;
};

export const deriveHistorySessionTitle = (firstMessage: ChatMessage): string => {
	let title = sanitizeHistoryTitle(firstMessage.content.trim());
	if (firstMessage.role === 'system' && !title) {
		title = '新对话';
	}
	return truncateTitleToBytes(title, 100);
};

export const generateHistoryFileName = (firstMessage: ChatMessage): string => {
	const title = deriveHistorySessionTitle(firstMessage);
	const timestamp = formatChatHistoryTimestampForFileName(firstMessage.timestamp);
	return `${title}-${timestamp}`;
};

export const extractHistoryFrontmatter = (
	content: string,
	parseYaml: Pick<ObsidianApiProvider, 'parseYaml'>['parseYaml'],
): { frontmatter: Record<string, unknown> | null; body: string } => {
	if (!content.startsWith(FRONTMATTER_DELIMITER)) {
		return { frontmatter: null, body: content };
	}
	const secondDelimiterIndex = content.indexOf(
		FRONTMATTER_DELIMITER,
		FRONTMATTER_DELIMITER.length,
	);
	if (secondDelimiterIndex === -1) {
		return { frontmatter: null, body: content };
	}
	const frontmatterBlock = content
		.substring(FRONTMATTER_DELIMITER.length, secondDelimiterIndex)
		.trim();
	const body = content
		.substring(secondDelimiterIndex + FRONTMATTER_DELIMITER.length)
		.trimStart();
	return {
		frontmatter: parseYaml(frontmatterBlock) as Record<string, unknown>,
		body,
	};
};
