import type { SelectedTextContext } from 'src/domains/chat/types';

const escapeXml = (value: string): string => value
	.replace(/&/gu, '&amp;')
	.replace(/</gu, '&lt;')
	.replace(/>/gu, '&gt;')
	.replace(/"/gu, '&quot;')
	.replace(/'/gu, '&apos;');

const hasUsableLineRange = (context?: SelectedTextContext): boolean =>
	typeof context?.range?.startLine === 'number'
	&& typeof context?.range?.endLine === 'number'
	&& context.range.endLine >= context.range.startLine;

export const buildSelectedTextSourceLabel = (
	selectedTextContext?: SelectedTextContext,
): string | undefined => {
	const filePath = selectedTextContext?.filePath?.trim();
	if (hasUsableLineRange(selectedTextContext)) {
		const startLine = selectedTextContext!.range!.startLine!;
		const endLine = selectedTextContext!.range!.endLine!;
		const lineSuffix = startLine === endLine
			? `#L${startLine}`
			: `#L${startLine}-L${endLine}`;
		return filePath
			? `selected_text @ ${filePath}${lineSuffix}`
			: `selected_text @ lines ${startLine}-${endLine}`;
	}
	if (filePath) {
		return `selected_text @ ${filePath}`;
	}
	return undefined;
};

export const buildSelectionContextPromptBlock = (params: {
	selectedText?: string | null;
	selectedTextContext?: SelectedTextContext;
}): string | undefined => {
	const filePath = params.selectedTextContext?.filePath?.trim();
	const hasSelectionText = Boolean(params.selectedText?.trim());
	if (!filePath && !hasUsableLineRange(params.selectedTextContext)) {
		return undefined;
	}

	const lines = ['<selection-context>'];
	if (filePath) {
		lines.push(`selected_text_file=${escapeXml(filePath)}`);
	}
	if (hasUsableLineRange(params.selectedTextContext)) {
		const startLine = params.selectedTextContext!.range!.startLine!;
		const endLine = params.selectedTextContext!.range!.endLine!;
		lines.push(`selected_text_lines=${startLine}-${endLine}`);
		lines.push(`selected_text_line_count=${endLine - startLine + 1}`);
	}
	if (hasSelectionText) {
		lines.push('selected_text_binding=the selected_text context document refers to this file/range');
	}
	lines.push('default_local_strategy=prefer local reads and minimal edits in this file/range before broader rewrites');
	lines.push('edit_file_strategy=for "modify this segment", prefer edit_file with the smallest unique oldText anchor; if the anchor is unclear, read this segment first');
	lines.push('</selection-context>');
	return lines.join('\n');
};