/**
 * @module editor/service
 * @description 承载 editor 域中与 Tab Completion 相关的上下文构建、建议请求与后处理逻辑。
 *
 * @dependencies src/domains/editor/types, src/domains/editor/config, src/providers/providers.types, @codemirror/state
 * @side-effects 发送通知、发射域事件、启动与取消异步请求
 * @invariants 不直接导入 obsidian，不直接访问 legacy settings 或 provider 模块。
 */

import { EditorState } from '@codemirror/state';
import { DEFAULT_CONTINUOUS_USAGE_CONFIG, DEFAULT_EDITOR_CONTEXT_OPTIONS } from './config';
import {
	analyzeContextType,
	applyListFormat,
	detectMarkdownFormat,
	extractListItemFormat,
	needsLeadingNewline,
} from './service-helpers';
import {
	ContextType,
	type ContextBuilderOptions,
	type EditorCompletionMessage,
	type EditorCompletionProvider,
	type EditorContext,
	type EditorTabCompletionEvents,
	type EditorTabCompletionRuntime,
	type PendingSuggestionRequest,
} from './types';
import type { EventBus, NoticePort, SystemPromptPort } from 'src/providers/providers.types';

/** @precondition state 为有效的 EditorState @postcondition 返回与光标对齐的上下文 @throws 从不抛出 @example buildEditorContext(state) */
export function buildEditorContext(state: EditorState, options: Partial<ContextBuilderOptions> = {}): EditorContext {
	const finalOptions = { ...DEFAULT_EDITOR_CONTEXT_OPTIONS, ...options };
	const cursorPos = state.selection.main.head;
	const document = state.doc;
	const fullText = document.toString();
	const textBefore = document.sliceString(Math.max(0, cursorPos - finalOptions.maxCharsBefore), cursorPos);
	const textAfter = document.sliceString(cursorPos, Math.min(document.length, cursorPos + finalOptions.maxCharsAfter));
	const currentLineObject = document.lineAt(cursorPos);
	const columnNumber = cursorPos - currentLineObject.from;
	const currentLine = currentLineObject.text;
	const listItemFormat = extractListItemFormat(currentLine);
	const contextType = analyzeContextType(fullText, cursorPos, currentLine);
	const textBeforeCursorOnLine = currentLine.slice(0, columnNumber);
	const textAfterCursorOnLine = currentLine.slice(columnNumber);
	return {
		textBefore,
		textAfter,
		currentLine,
		textBeforeCursorOnLine,
		textAfterCursorOnLine,
		lineNumber: currentLineObject.number - 1,
		columnNumber,
		cursorPos,
		contextType,
		needsLeadingNewline: needsLeadingNewline(contextType, textBeforeCursorOnLine, textAfterCursorOnLine, listItemFormat),
		isMarkdownFormatted: detectMarkdownFormat(fullText),
		listItemFormat,
	};
}

/** @precondition context 来自 buildEditorContext @postcondition 返回与上下文类型匹配的提示说明 @throws 从不抛出 @example generateContextPrompt(buildEditorContext(EditorState.create({ doc: 'text' }))) */
export function generateContextPrompt(context: EditorContext): string {
	const formatType = context.isMarkdownFormatted ? 'Markdown' : '纯文本';
	const prefix = context.contextType === ContextType.ListItem && context.listItemFormat
		? `续写列表内容，使用“${context.listItemFormat.isOrdered ? '数字.' : context.listItemFormat.marker}”作为列表符号。`
		: context.contextType === ContextType.CodeBlock
			? '续写代码，保持语法正确。'
			: context.contextType === ContextType.Table
				? '续写表格行。'
				: context.contextType === ContextType.Blockquote
					? '续写引用内容。'
					: context.contextType === ContextType.Frontmatter
						? '续写 YAML 字段。'
						: context.contextType === ContextType.Heading
							? '在标题后续写正文。'
							: '自然续写内容。';
	return `${prefix} 输出格式：${formatType}。`;
}

export function postProcessSuggestion(suggestion: string, context: EditorContext): string {
	if (!suggestion.trim()) {
		return '';
/** @precondition suggestion 为 AI 返回的原始续写文本 @postcondition 返回贴合当前上下文格式的建议文本 @throws 从不抛出 @example postProcessSuggestion('next line', context) */
	}
	let processed = suggestion.replace(/^```(?:markdown|md)?\n([\s\S]*?)\n?```$/u, '$1');
	if (context.needsLeadingNewline && !processed.startsWith('\n')) {
		processed = `\n${processed}`;
	}
	if (!context.needsLeadingNewline && processed.startsWith('\n')) {
		const trimmed = processed.replace(/^\n+/u, '');
		processed = !context.textBeforeCursorOnLine.endsWith(' ') && !trimmed.startsWith(' ') ? ` ${trimmed}` : trimmed;
	}
	if (context.contextType === ContextType.ListItem && context.listItemFormat) {
		processed = applyListFormat(processed, context.listItemFormat, context.needsLeadingNewline);
	}
	if (context.contextType === ContextType.Blockquote) {
		processed = processed
			.split('\n')
			.map((line) => (line.trim() && !line.startsWith('>') ? `> ${line}` : line))
			.join('\n');
	}
	return processed;
}

/** @precondition text 为待裁剪文本 @postcondition 返回不超过指定句数的文本前缀 @throws 从不抛出 @example limitSuggestionLength('第一句。第二句。', 1) */
export function limitSuggestionLength(text: string, maxSentences: number = 1): string {
	if (maxSentences <= 0) {
		return text;
	}
	const sentenceEnders = /[。！？.!?]/gu;
	let sentenceCount = 0;
	let lastEndIndex = 0;
	for (const match of text.matchAll(sentenceEnders)) {
		sentenceCount += 1;
		lastEndIndex = (match.index ?? 0) + 1;
		if (sentenceCount >= maxSentences) {
			return text.slice(0, lastEndIndex);
		}
	}
	return text;
}

/** @precondition history 中保存历史确认时间戳 @postcondition 返回当前触发是否属于连续使用 @throws 从不抛出 @example isContinuousUsage([1000, 2000], 4000) */
export function isContinuousUsage(history: readonly number[], now: number): boolean {
	return history.filter((time) => now - time < DEFAULT_CONTINUOUS_USAGE_CONFIG.timeWindowMs).length
		>= DEFAULT_CONTINUOUS_USAGE_CONFIG.minConsecutiveCount - 1;
}

/** @precondition providers 为当前可用候选 provider 列表 @postcondition 返回匹配 tag 的 provider 或首个默认 provider @throws 从不抛出 @example selectCompletionProvider('demo', providers) */
export function selectCompletionProvider(providerTag: string, providers: readonly EditorCompletionProvider[]): EditorCompletionProvider | null {
	if (!providerTag) {
		return providers[0] ?? null;
	}
	return providers.find((provider) => provider.tag === providerTag) ?? null;
}

/**
 * @precondition obsidianApi、runtime 来自组合根注入
 * @postcondition 提供 editor 域 Tab Completion 请求生命周期管理
 * @throws 仅在外部 provider 或 runtime 失配时由调用方观察到错误
 */
export class EditorTabCompletionService {
	private currentRequest: PendingSuggestionRequest | null = null;
	private requestCounter = 0;
	private lastRequestTime = 0;
	private completionHistory: number[] = [];

	constructor(
		private readonly obsidianApi: NoticePort & SystemPromptPort,
		private readonly eventBus: EventBus<EditorTabCompletionEvents> | null,
		private runtime: EditorTabCompletionRuntime,
	) {}

	/** @precondition runtime 为完整可用的运行时快照 @postcondition 后续请求将使用新的 runtime @throws 从不抛出 @example service.updateRuntime(runtime) */
	updateRuntime(runtime: EditorTabCompletionRuntime): void {
		this.runtime = runtime;
	}

	/** @precondition state 来自当前编辑器状态 @postcondition 命中条件时返回新的待处理请求并发射 requested 事件 @throws 从不抛出 @example service.startSuggestionRequest({ state, editable: true }) */
	startSuggestionRequest(params: { state: EditorState; editable: boolean }): PendingSuggestionRequest | null {
		const settings = this.runtime.settings;
		if (!settings.enabled) {
			return null;
		}
		const now = Date.now();
		if (now - this.lastRequestTime < 300) {
			this.runtime.logger?.debug('[EditorDomain] 请求被防抖过滤');
			return null;
		}
		this.lastRequestTime = now;
		if (!params.editable) {
			this.obsidianApi.notify(this.runtime.messages.readOnly);
			return null;
		}
		const provider = selectCompletionProvider(settings.providerTag, this.runtime.providers);
		if (!provider) {
			this.obsidianApi.notify(this.runtime.messages.noProvider);
			return null;
		}
		this.cancel();
		const pendingRequest: PendingSuggestionRequest = {
			requestId: `editor-${++this.requestCounter}-${Date.now()}`,
			context: buildEditorContext(params.state, {
				maxCharsBefore: settings.contextLengthBefore,
				maxCharsAfter: settings.contextLengthAfter,
			}),
			provider,
			controller: new AbortController(),
			maxSentences: isContinuousUsage(this.completionHistory, now)
				? DEFAULT_CONTINUOUS_USAGE_CONFIG.maxSentencesOnContinuous
				: DEFAULT_CONTINUOUS_USAGE_CONFIG.defaultMaxSentences,
		};
		this.currentRequest = pendingRequest;
		this.eventBus?.emit('editor.tab-completion.requested', {
			requestId: pendingRequest.requestId,
			providerTag: pendingRequest.provider.tag,
		});
		return pendingRequest;
	}

	/** @precondition pendingRequest 为 startSuggestionRequest 返回的未完成请求 @postcondition 返回后处理后的建议文本并回收当前请求状态 @throws 从不抛出，失败时返回空字符串并通知用户 @example await service.resolveSuggestion(pendingRequest) */
	async resolveSuggestion(pendingRequest: PendingSuggestionRequest): Promise<string> {
		const timeoutId = setTimeout(() => pendingRequest.controller.abort(), this.runtime.settings.timeout);
		try {
			const messages = await this.buildMessages(pendingRequest.context, pendingRequest.maxSentences);
			let suggestion = '';
			for await (const chunk of pendingRequest.provider.sendCompletion(messages, pendingRequest.controller)) {
				suggestion += chunk;
				if (pendingRequest.controller.signal.aborted) {
					break;
				}
			}
			const processedSuggestion = limitSuggestionLength(
				postProcessSuggestion(suggestion.trim(), pendingRequest.context),
				pendingRequest.maxSentences,
			);
			this.eventBus?.emit('editor.tab-completion.completed', {
				requestId: pendingRequest.requestId,
				textLength: processedSuggestion.length,
			});
			return processedSuggestion;
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				return '';
			}
			this.runtime.logger?.error('[EditorDomain] AI 请求失败', error);
			const message = error instanceof Error ? error.message || this.runtime.messages.failedDefaultReason : this.runtime.messages.failedDefaultReason;
			this.obsidianApi.notify(this.runtime.messages.failedPrefix.replace('{message}', message), 3000);
			this.eventBus?.emit('editor.tab-completion.failed', { requestId: pendingRequest.requestId, message });
			return '';
		} finally {
			clearTimeout(timeoutId);
			if (this.currentRequest?.requestId === pendingRequest.requestId) {
				this.currentRequest = null;
			}
		}
	}

	/** @precondition 当前建议已被用户接受 @postcondition 连续使用历史加入本次确认时间 @throws 从不抛出 @example service.confirmSuggestion() */
	confirmSuggestion(): void {
		const now = Date.now();
		this.completionHistory = [...this.completionHistory.filter((time) => now - time < DEFAULT_CONTINUOUS_USAGE_CONFIG.timeWindowMs), now];
	}

	/** @precondition 无 @postcondition 当前待处理请求若存在则被取消 @throws 从不抛出 @example service.cancel() */
	cancel(): void {
		this.currentRequest?.controller.abort();
		this.currentRequest = null;
	}

	/** @precondition 无 @postcondition 服务被安全释放且不会残留活动请求 @throws 从不抛出 @example service.dispose() */
	dispose(): void {
		this.cancel();
	}

	private async buildMessages(context: EditorContext, maxSentences: number): Promise<EditorCompletionMessage[]> {
		const globalPrompt = (await this.obsidianApi.buildGlobalSystemPrompt('tab_completion')).trim();
		const rules = `规则：\n1. 直接输出续写内容，不要解释\n2. ${maxSentences === 1 ? '续写一句话' : `续写${maxSentences}句话左右`}\n3. 不要重复已有内容\n4. ${generateContextPrompt(context)}`;
		const contextBlock = context.textAfter.trim() ? `${context.textBefore}\n[...后续内容省略...]` : context.textBefore;
		const template = this.runtime.settings.promptTemplate?.trim() || '{{rules}}\n\n{{context}}';
		const userPrompt = template.replace(/\{\{rules\}\}/gu, rules).replace(/\{\{context\}\}/gu, contextBlock).trim() || `${rules}\n\n${contextBlock}`;
		const messages: EditorCompletionMessage[] = [];
		if (globalPrompt) {
			messages.push({ role: 'system', content: globalPrompt });
		}
		messages.push({ role: 'user', content: userPrompt });
		return messages;
	}
}
