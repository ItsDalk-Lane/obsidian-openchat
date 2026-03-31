/**
 * @module editor/types
 * @description 定义 editor 域的纯类型与状态结构。
 *
 * @dependencies 无
 * @side-effects 无
 * @invariants 不导入其他层，不包含任何运行时代码。
 */

export type EditorCompletionRole = 'system' | 'user';

export interface EditorCompletionMessage {
	readonly role: EditorCompletionRole;
	readonly content: string;
}

export interface EditorCompletionProvider {
	readonly tag: string;
	readonly vendor: string;
	sendCompletion(messages: readonly EditorCompletionMessage[], controller: AbortController): AsyncGenerator<string, void, unknown>;
}

export interface EditorDomainLogger {
	debug(message: string, metadata?: unknown): void;
	error(message: string, metadata?: unknown): void;
}

export interface TabCompletionMessages {
	readonly readOnly: string;
	readonly noProvider: string;
	readonly failedDefaultReason: string;
	readonly failedPrefix: string;
}

export interface EditorTabCompletionSettings {
	readonly enabled: boolean;
	readonly triggerKey: string;
	readonly contextLengthBefore: number;
	readonly contextLengthAfter: number;
	readonly timeout: number;
	readonly providerTag: string;
	readonly promptTemplate: string;
}

export interface EditorTabCompletionRuntime {
	readonly defaultModelTag: string;
	readonly providers: readonly EditorCompletionProvider[];
	readonly settings: EditorTabCompletionSettings;
	readonly messages: TabCompletionMessages;
	readonly logger?: EditorDomainLogger;
}

export interface ContextBuilderOptions {
	readonly maxCharsBefore: number;
	readonly maxCharsAfter: number;
}

export enum ContextType {
	Paragraph = 'paragraph',
	ListItem = 'list_item',
	CodeBlock = 'code_block',
	Table = 'table',
	Blockquote = 'blockquote',
	Heading = 'heading',
	Frontmatter = 'frontmatter',
	Empty = 'empty',
}

export interface ListItemFormat {
	readonly indent: string;
	readonly marker: string;
	readonly isOrdered: boolean;
	readonly nextItemPrefix: string;
}

export interface EditorContext {
	readonly textBefore: string;
	readonly textAfter: string;
	readonly currentLine: string;
	readonly textBeforeCursorOnLine: string;
	readonly textAfterCursorOnLine: string;
	readonly lineNumber: number;
	readonly columnNumber: number;
	readonly cursorPos: number;
	readonly contextType: ContextType;
	readonly needsLeadingNewline: boolean;
	readonly isMarkdownFormatted: boolean;
	readonly listItemFormat: ListItemFormat | null;
}

export interface ContinuousUsageConfig {
	readonly timeWindowMs: number;
	readonly minConsecutiveCount: number;
	readonly maxSentencesOnContinuous: number;
	readonly defaultMaxSentences: number;
}

export interface PendingSuggestionRequest {
	readonly requestId: string;
	readonly context: EditorContext;
	readonly provider: EditorCompletionProvider;
	readonly controller: AbortController;
	readonly maxSentences: number;
}

export interface TabCompletionStateValue {
	readonly isShowing: boolean;
	readonly suggestionText: string;
	readonly suggestionPos: number;
	readonly isLoading: boolean;
	readonly requestId: string | null;
}

export interface EditorTabCompletionEvents {
	'editor.tab-completion.requested': { requestId: string; providerTag: string };
	'editor.tab-completion.completed': { requestId: string; textLength: number };
	'editor.tab-completion.failed': { requestId: string; message: string };
}
