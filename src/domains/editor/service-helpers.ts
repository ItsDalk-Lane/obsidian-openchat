/**
 * @module editor/service-helpers
 * @description 承载 editor 域 service 的纯辅助函数。
 *
 * @dependencies src/domains/editor/types
 * @side-effects 无
 * @invariants 仅处理上下文分析与格式修正，不持有运行时状态。
 */

import { ContextType, type ListItemFormat } from './types';

/** @precondition fullText、currentLine 来自同一编辑器快照 @postcondition 返回最贴近当前位置的上下文类型 @throws 从不抛出 @example analyzeContextType('- item', 6, '- item') */
export function analyzeContextType(fullText: string, cursorPos: number, currentLine: string): ContextType {
	const trimmedLine = currentLine.trim();
	const frontmatterEnd = fullText.indexOf('---', 3);
	const frontmatterBoundary = frontmatterEnd === -1 ? fullText.length : frontmatterEnd + 3;
	if (!fullText.trim()) return ContextType.Empty;
	if (fullText.startsWith('---') && cursorPos > 3 && cursorPos < frontmatterBoundary) return ContextType.Frontmatter;
	if ((fullText.slice(0, cursorPos).match(/```/gu) ?? []).length % 2 === 1) return ContextType.CodeBlock;
	if (/^(\s*)[-*+]\s/u.test(currentLine) || /^(\s*)\d+\.\s/u.test(currentLine)) return ContextType.ListItem;
	if (/^\|.*\|$/u.test(trimmedLine)) return ContextType.Table;
	if (/^>\s*/u.test(currentLine)) return ContextType.Blockquote;
	if (/^#{1,6}\s/u.test(currentLine)) return ContextType.Heading;
	return ContextType.Paragraph;
}

/** @precondition listItemFormat 与 contextType 对应同一上下文 @postcondition 返回建议文本是否应以换行开头 @throws 从不抛出 @example needsLeadingNewline(ContextType.ListItem, '- item', '', { indent: '', marker: '-', isOrdered: false, nextItemPrefix: '- ' }) */
export function needsLeadingNewline(
	contextType: ContextType,
	textBefore: string,
	textAfter: string,
	listItemFormat: ListItemFormat | null,
): boolean {
	if (textAfter.trim()) return false;
	if (!textBefore.trim()) return false;
	return contextType === ContextType.ListItem && Boolean(listItemFormat)
		|| contextType === ContextType.CodeBlock
		|| contextType === ContextType.Blockquote
		|| contextType === ContextType.Table;
}

/** @precondition fullText 为当前文档内容 @postcondition 返回文档是否表现为 Markdown 富格式文本 @throws 从不抛出 @example detectMarkdownFormat('# title\n- item') */
export function detectMarkdownFormat(fullText: string): boolean {
	const patterns = [/^#{1,6}\s/mu, /\*\*.+\*\*/u, /^\s*[-*+]\s/mu, /^\s*\d+\.\s/mu, /^\s*>/mu, /```/u, /\[[^\]]+\]\([^)]*\)/u, /^\|.+\|$/mu];
	return patterns.filter((pattern) => pattern.test(fullText)).length >= 2;
}

/** @precondition currentLine 是列表项所在行文本 @postcondition 若匹配列表项则返回下一行应沿用的格式 @throws 从不抛出 @example extractListItemFormat('1. item') */
export function extractListItemFormat(currentLine: string): ListItemFormat | null {
	const unorderedMatch = currentLine.match(/^(\s*)([-*+])\s/u);
	if (unorderedMatch) {
		return { indent: unorderedMatch[1], marker: unorderedMatch[2], isOrdered: false, nextItemPrefix: `${unorderedMatch[1]}${unorderedMatch[2]} ` };
	}
	const orderedMatch = currentLine.match(/^(\s*)(\d+)\.\s/u);
	if (!orderedMatch) return null;
	const currentNumber = Number.parseInt(orderedMatch[2], 10);
	return { indent: orderedMatch[1], marker: `${currentNumber}.`, isOrdered: true, nextItemPrefix: `${orderedMatch[1]}${currentNumber + 1}. ` };
}

/** @precondition text 为 AI 原始续写片段 @postcondition 返回按原列表格式修正后的文本 @throws 从不抛出 @example applyListFormat('next', { indent: '', marker: '-', isOrdered: false, nextItemPrefix: '- ' }, true) */
export function applyListFormat(text: string, listItemFormat: ListItemFormat, needsNewline: boolean): string {
	let currentNumber = listItemFormat.isOrdered ? Number.parseInt(listItemFormat.marker, 10) : 0;
	return text.split('\n').map((line, index) => {
		if (!line.trim()) return line;
		if (/^\s*[-*+]\s/u.test(line) || /^\s*\d+\.\s/u.test(line)) {
			if (!listItemFormat.isOrdered) return line.replace(/^\s*[-*+]\s/u, listItemFormat.nextItemPrefix);
			currentNumber += 1;
			return line.replace(/^\s*\d+\.\s/u, `${listItemFormat.indent}${currentNumber}. `);
		}
		if (index > 0 || needsNewline) {
			if (!listItemFormat.isOrdered) return `${listItemFormat.nextItemPrefix}${line.trim()}`;
			currentNumber += 1;
			return `${listItemFormat.indent}${currentNumber}. ${line.trim()}`;
		}
		return line;
	}).join('\n');
}
