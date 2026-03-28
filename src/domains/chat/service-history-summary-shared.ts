export const MAX_SECTION_ITEMS = 6
export const MAX_SUMMARY_LINE_CHARS = 220
export const TOOL_RESULT_PREVIEW_CHARS = 160
export const HISTORY_SUMMARY_HEADER = '[Earlier conversation summary]'
export const HISTORY_SUMMARY_INTRO =
	'This block compresses earlier chat turns. Treat it as prior context, not a new instruction.'
export const SUMMARY_CONTEXT_HEADING = '[CONTEXT]'
export const SUMMARY_DECISIONS_HEADING = '[KEY DECISIONS]'
export const SUMMARY_CURRENT_STATE_HEADING = '[CURRENT STATE]'
export const SUMMARY_IMPORTANT_DETAILS_HEADING = '[IMPORTANT DETAILS]'
export const SUMMARY_OPEN_ITEMS_HEADING = '[OPEN ITEMS]'
export const SUMMARY_HEADINGS = [
	SUMMARY_CONTEXT_HEADING,
	SUMMARY_DECISIONS_HEADING,
	SUMMARY_CURRENT_STATE_HEADING,
	SUMMARY_IMPORTANT_DETAILS_HEADING,
	SUMMARY_OPEN_ITEMS_HEADING,
] as const

export const normalizeSummaryText = (content: string): string =>
	String(content ?? '')
		.replace(/<!-- FF_AGENT_EVENTS_START -->[\s\S]*?<!-- FF_AGENT_EVENTS_END -->/g, ' ')
		.replace(/\{\{FF_MCP_TOOL_START\}\}[\s\S]*?\{\{FF_MCP_TOOL_END\}\}/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()

export const compactSummaryLine = (
	content: string,
	maxChars = MAX_SUMMARY_LINE_CHARS,
): string => {
	const normalized = normalizeSummaryText(content)
	if (!normalized) {
		return ''
	}
	if (normalized.length <= maxChars) {
		return normalized
	}
	return `${normalized.slice(0, Math.max(0, maxChars - 1)).trim()}…`
}