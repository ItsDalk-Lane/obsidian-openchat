import { countTokens } from 'gpt-tokenizer';
import type { ToolDefinition } from 'src/types/tool';
import type { Message as ProviderMessage } from 'src/types/provider';
import type { ChatMessage } from '../types/chat';
import { parseContentBlocks } from './markdown';

export const EMBED_TOKEN_ESTIMATE = 256;

interface ToolDefinitionLike {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
}

export interface RequestTokenEstimate {
	totalTokens: number;
	messageTokens: number;
	toolTokens: number;
}

const toTokenSafeText = (value: unknown): string => {
	if (typeof value === 'string') {
		return value;
	}
	if (value === null || value === undefined) {
		return '';
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

export function countTextTokens(text: string): number {
	if (!text) {
		return 0;
	}

	try {
		return Number(countTokens(text));
	} catch {
		return Math.ceil(text.length / 4);
	}
}

function countChatMessageTokens(role: 'user' | 'assistant' | 'system', content: string): number {
	try {
		return Number(
			countTokens([
				{
					role,
					content,
				},
			] as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>)
		);
	} catch {
		return Math.ceil(content.length / 4);
	}
}

function getUserTurnRuntimeEstimate(message: ChatMessage): number | null {
	const value = message.metadata?.userTurnTokenEstimate;
	return typeof value === 'number' && Number.isFinite(value) && value >= 0
		? value
		: null;
}

function buildDisplayTokenPayload(message: ChatMessage): {
	role: 'user' | 'assistant' | 'system';
	content: string;
} {
	if (message.role === 'assistant') {
		const blocks = parseContentBlocks(message.content ?? '');
		const content = blocks
			.map((block) => {
				if (block.type === 'mcpTool') {
					return `${block.toolName}\n${block.content}`.trim();
				}
				return block.content;
			})
			.filter((segment) => segment.trim().length > 0)
			.join('\n\n');

		return {
			role: 'assistant',
			content,
		};
	}

	const baseContent = message.content ?? '';
	const selectedText =
		typeof message.metadata?.selectedText === 'string'
			? message.metadata.selectedText.trim()
			: '';
	const combined = selectedText
		? `${baseContent}\n\n${selectedText}`.trim()
		: baseContent;

	return {
		role: message.role === 'system' ? 'system' : 'user',
		content: combined,
	};
}

/**
 * 计算单条消息的 token 数量。
 * - 用户消息优先使用运行时写入的“本轮用户负载”估算。
 * - 其它消息按聊天界面实际展示内容估算，并把图片 / 推理块纳入统计。
 */
export function countMessageTokens(message: ChatMessage): number {
	const runtimeEstimate = message.role === 'user'
		? getUserTurnRuntimeEstimate(message)
		: null;
	if (runtimeEstimate !== null) {
		return runtimeEstimate;
	}

	const payload = buildDisplayTokenPayload(message);
	if (!payload.content) {
		return (message.images?.length ?? 0) * EMBED_TOKEN_ESTIMATE;
	}

	return (
		countChatMessageTokens(payload.role, payload.content)
		+ (message.images?.length ?? 0) * EMBED_TOKEN_ESTIMATE
	);
}

export function estimateProviderMessagesTokens(
	messages: Array<Pick<ProviderMessage, 'role' | 'content' | 'embeds' | 'reasoning_content'>>
): number {
	if (messages.length === 0) {
		return 0;
	}

	try {
		const messageTokens = Number(
			countTokens(
				messages.map((message) => ({
					role: message.role,
					content: message.content ?? '',
				})) as Array<{ role: ProviderMessage['role']; content: string }>
			)
		);
		const reasoningTokens = messages.reduce(
			(sum, message) => sum + countTextTokens(message.reasoning_content ?? ''),
			0
		);
		const embedPenalty = messages.reduce(
			(sum, message) => sum + (message.embeds?.length ?? 0) * EMBED_TOKEN_ESTIMATE,
			0
		);
		return messageTokens + reasoningTokens + embedPenalty;
	} catch {
		const rawText = messages
			.map((message) =>
				[
					message.role,
					toTokenSafeText(message.content),
					toTokenSafeText(message.reasoning_content),
				]
					.filter((segment) => segment.length > 0)
					.join('\n')
			)
			.join('\n\n');
		const embedPenalty = messages.reduce(
			(sum, message) => sum + (message.embeds?.length ?? 0) * EMBED_TOKEN_ESTIMATE,
			0
		);
		return countTextTokens(rawText) + embedPenalty;
	}
}

export function estimateToolDefinitionTokens(
	tools: Array<ToolDefinitionLike | ToolDefinition>
): number {
	if (!Array.isArray(tools) || tools.length === 0) {
		return 0;
	}

	const normalized = tools.map((tool) => ({
		name: tool.name,
		description: tool.description ?? '',
		input_schema: tool.inputSchema ?? {},
	}));
	return countTextTokens(JSON.stringify(normalized));
}

export function estimateRequestPayloadTokens(params: {
	messages: Array<Pick<ProviderMessage, 'role' | 'content' | 'embeds' | 'reasoning_content'>>;
	tools?: Array<ToolDefinitionLike | ToolDefinition>;
}): RequestTokenEstimate {
	const messageTokens = estimateProviderMessagesTokens(params.messages);
	const toolTokens = estimateToolDefinitionTokens(params.tools ?? []);
	return {
		totalTokens: messageTokens + toolTokens,
		messageTokens,
		toolTokens,
	};
}

/**
 * 格式化 token 数量显示
 */
export function formatTokenCount(count: number): string {
	if (count < 1000) {
		return `${count}`;
	}
	return `${(count / 1000).toFixed(1)}k`;
}
