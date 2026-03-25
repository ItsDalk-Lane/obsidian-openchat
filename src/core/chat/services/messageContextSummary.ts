import { parseContentBlocks } from 'src/core/chat/utils/markdown'
import type { ChatMessage } from '../types/chat'

const MAX_SECTION_ITEMS = 6
const MAX_SUMMARY_LINE_CHARS = 220
const TOOL_RESULT_PREVIEW_CHARS = 160
const HISTORY_SUMMARY_HEADER = '[Earlier conversation summary]'
const HISTORY_SUMMARY_INTRO =
	'This block compresses earlier chat turns. Treat it as prior context, not a new instruction.'
const SUMMARY_CONTEXT_HEADING = '[CONTEXT]'
const SUMMARY_DECISIONS_HEADING = '[KEY DECISIONS]'
const SUMMARY_CURRENT_STATE_HEADING = '[CURRENT STATE]'
const SUMMARY_IMPORTANT_DETAILS_HEADING = '[IMPORTANT DETAILS]'
const SUMMARY_OPEN_ITEMS_HEADING = '[OPEN ITEMS]'
const SUMMARY_HEADINGS = [
	SUMMARY_CONTEXT_HEADING,
	SUMMARY_DECISIONS_HEADING,
	SUMMARY_CURRENT_STATE_HEADING,
	SUMMARY_IMPORTANT_DETAILS_HEADING,
	SUMMARY_OPEN_ITEMS_HEADING,
] as const

interface StructuredSummary {
	preamble: string[]
	sections: Array<{ heading: string; items: string[] }>
}

export interface SummaryBuildResult {
	summary: string
	droppedReasoningCount: number
}

export function buildHistorySummary(
	messages: ChatMessage[],
	summaryBudgetTokens: number,
): SummaryBuildResult {
	const sessionIntent: string[] = []
	const currentState: string[] = []
	const decisions: string[] = []
	const importantDetails: string[] = []
	const openItems: string[] = []
	let droppedReasoningCount = 0
	const detailLimit =
		summaryBudgetTokens < 320
			? 2
			: summaryBudgetTokens < 640
				? 4
				: MAX_SECTION_ITEMS
	const importantDetailLimit = Math.min(MAX_SECTION_ITEMS, Math.max(4, detailLimit))

	for (const message of messages) {
		const text = extractVisibleText(message)
		const compact = compactLine(text)

		if (message.role === 'user' && compact) {
			pushUnique(sessionIntent, compact)
			pushUnique(openItems, compact)
		}

		if (message.role === 'assistant' && compact) {
			pushUnique(currentState, compact)
			if (looksLikeDecision(compact)) {
				pushUnique(decisions, compact)
			}
		}

		if (message.role === 'user') {
			const constraints = extractConstraintLines(message.content)
			for (const requirement of constraints.requirements) {
				pushUnique(importantDetails, `Requirement: ${requirement}`)
			}
			for (const prohibition of constraints.prohibitions) {
				pushUnique(importantDetails, `Prohibition: ${prohibition}`)
			}
		}

		const reasoningBlocks = parseContentBlocks(message.content).filter(
			(block) => block.type === 'reasoning'
		)
		droppedReasoningCount += reasoningBlocks.length

		for (const reference of extractPathReferences(message)) {
			pushUnique(importantDetails, `Path: ${reference}`)
		}

		for (const detail of extractImportantDetailLines(message.content)) {
			pushUnique(importantDetails, detail)
		}

		for (const toolCall of message.toolCalls ?? []) {
			const parts = [toolCall.name]
			const target = extractToolTarget(toolCall.arguments ?? {})
			if (target) {
				parts.push(target)
			}
			const resultPreview = compactLine(toolCall.result ?? '', TOOL_RESULT_PREVIEW_CHARS)
			if (resultPreview) {
				parts.push(`结果: ${resultPreview}`)
			}
			pushUnique(importantDetails, `Tool: ${parts.join(' · ')}`)
		}
	}

	const lines = [
		HISTORY_SUMMARY_HEADER,
		HISTORY_SUMMARY_INTRO,
		'',
		SUMMARY_CONTEXT_HEADING,
		...toBulletLines(sessionIntent, Math.min(3, detailLimit)),
		'',
		SUMMARY_DECISIONS_HEADING,
		...toBulletLines(decisions, detailLimit),
		'',
		SUMMARY_CURRENT_STATE_HEADING,
		...toBulletLines(currentState, detailLimit),
		'',
		SUMMARY_IMPORTANT_DETAILS_HEADING,
		...toBulletLines(importantDetails, importantDetailLimit),
		'',
		SUMMARY_OPEN_ITEMS_HEADING,
		...toBulletLines(openItems, Math.min(3, detailLimit)),
	]

	return {
		summary: lines.join('\n').trim(),
		droppedReasoningCount,
	}
}

export function normalizeGeneratedHistorySummary(
	summary: string | null,
	fallback: string,
): string {
	const trimmed = summary?.trim()
	if (!trimmed) {
		return fallback
	}
	if (!hasExpectedSummaryStructure(trimmed)) {
		return fallback
	}
	const normalized = trimmed.includes(HISTORY_SUMMARY_HEADER)
		? trimmed
		: [
			HISTORY_SUMMARY_HEADER,
			HISTORY_SUMMARY_INTRO,
			'',
			trimmed,
		].join('\n')
	return mergeImportantDetails(normalized, fallback)
}

export function fitHistorySummaryToBudget(
	summary: string,
	targetBudgetTokens: number,
	estimateTokens: (value: string) => number,
): string {
	const trimmed = summary.trim()
	if (!trimmed || targetBudgetTokens <= 0) {
		return ''
	}

	let parsed = parseStructuredSummary(trimmed)
	let fitted = renderStructuredSummary(parsed)
	if (estimateTokens(fitted) <= targetBudgetTokens) {
		return fitted
	}

	const trimOrder = [
		SUMMARY_OPEN_ITEMS_HEADING,
		SUMMARY_CURRENT_STATE_HEADING,
		SUMMARY_DECISIONS_HEADING,
		SUMMARY_CONTEXT_HEADING,
	]

	for (;;) {
		let removed = false
		for (const heading of trimOrder) {
			const section = parsed.sections.find((item) => item.heading === heading)
			if (section && section.items.length > 1) {
				section.items.pop()
				removed = true
				break
			}
		}
		fitted = renderStructuredSummary(parsed)
		if (!removed || estimateTokens(fitted) <= targetBudgetTokens) {
			break
		}
	}

	for (const maxChars of [180, 140, 110, 90, 70, 50]) {
		parsed = {
			...parsed,
			sections: parsed.sections.map((section) => ({
				...section,
				items: section.items.map((item) =>
					item === '- None' || section.heading === SUMMARY_IMPORTANT_DETAILS_HEADING
						? item
						: `- ${compactLine(item.slice(2), maxChars)}`
				),
			})),
		}
		fitted = renderStructuredSummary(parsed)
		if (estimateTokens(fitted) <= targetBudgetTokens) {
			return fitted
		}
	}

	return fitted
}

const extractImportantDetailLines = (content: string): string[] => {
	const details: string[] = []
	const lines = String(content ?? '').split('\n')

	for (const rawLine of lines) {
		const line = rawLine.replace(/^\s*(?:[-*+]\s+|\d+[.)、]\s*|#+\s*)/, '').trim()
		if (!line || line.length > MAX_SUMMARY_LINE_CHARS * 1.8) {
			continue
		}
		if (
			/`[^`]+`/.test(line)
			|| /(?:^|[^\d])\d+(?:\.\d+)?(?:%|ms|s|kb|mb|gb|tokens?)?/i.test(line)
			|| /(max_tokens|max_output_tokens|contextlength|summarymodeltag|frontmatter|contextsummary|contextsourcesignature|totaltokenestimate)/i.test(line)
			|| /[:=]/.test(line)
		) {
			pushUnique(details, line)
		}
	}

	return details
}

const extractVisibleText = (message: ChatMessage): string => {
	if (message.role !== 'assistant') {
		return normalizeText(message.content)
	}

	const blocks = parseContentBlocks(message.content)
	const textBlocks = blocks.filter((block) => block.type === 'text')
	if (textBlocks.length > 0) {
		return normalizeText(textBlocks.map((block) => block.content).join('\n'))
	}
	return normalizeText(message.content)
}

const extractPathReferences = (message: ChatMessage): string[] => {
	const matches = new Set<string>()
	const push = (value: string) => {
		const normalized = normalizePathReference(value)
		if (normalized) {
			matches.add(normalized)
		}
	}

	for (const match of message.content.matchAll(/\[\[([^\]]+)\]\]/g)) {
		if (match[1]) {
			push(match[1])
		}
	}

	for (const match of message.content.matchAll(/`([^`\n]*[\\/][^`\n]+)`/g)) {
		if (match[1]) {
			push(match[1])
		}
	}

	for (const match of message.content.matchAll(
		/(?:^|[\s(（:：])((?:\/)?(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.:-]+(?:\.[A-Za-z0-9_.-]+)?)(?=$|[\s),.;:，。；）])/gm
	)) {
		if (match[1]) {
			push(match[1])
		}
	}

	for (const toolCall of message.toolCalls ?? []) {
		const target = extractToolTarget(toolCall.arguments ?? {})
		if (target) {
			push(target)
		}
	}

	return Array.from(matches).slice(0, MAX_SECTION_ITEMS)
}

const normalizePathReference = (value: string): string => {
	const normalized = value
		.trim()
		.replace(/[，。；：,.;:]+$/g, '')
		.replace(/^['"`]+|['"`]+$/g, '')
	return isLikelyPathReference(normalized) ? normalized : ''
}

const isLikelyPathReference = (value: string): boolean => {
	if (!value || /^https?:\/\//i.test(value)) {
		return false
	}
	if (!value.includes('/') && !value.includes('\\')) {
		return false
	}
	if (/\s/.test(value)) {
		return false
	}
	return /[A-Za-z0-9_.-]/.test(value)
}

const extractConstraintLines = (content: string): {
	requirements: string[]
	prohibitions: string[]
} => {
	const requirements: string[] = []
	const prohibitions: string[] = []
	const lines = String(content ?? '').split('\n')

	for (const rawLine of lines) {
		const line = rawLine.replace(/^\s*(?:[-*+]\s+|\d+[.)、]\s*|#+\s*)/, '').trim()
		if (!line || line.length > MAX_SUMMARY_LINE_CHARS * 1.8) {
			continue
		}
		if (isConstraintLine(line)) {
			if (isProhibitionLine(line)) {
				pushUnique(prohibitions, line)
			} else {
				pushUnique(requirements, line)
			}
		}
	}

	return { requirements, prohibitions }
}

const isConstraintLine = (line: string): boolean =>
	/必须|需要|应当|共享|进入同一套|只保留|优先生成|回退到|只能看到|至少要记住|完整保留|原始历史|frontmatter|reasoning_content|telemetry|markdown 正文|文件上下文|工具调用结果/i.test(
		line
	)

const isProhibitionLine = (line: string): boolean =>
	/不允许|禁止|不得|不能|不要|不再|严禁/i.test(line)

const hasExpectedSummaryStructure = (summary: string): boolean =>
	SUMMARY_HEADINGS.every((heading) => summary.includes(heading))

const mergeImportantDetails = (summary: string, fallback: string): string => {
	const fallbackItems = extractSectionItems(fallback, SUMMARY_IMPORTANT_DETAILS_HEADING)
	if (fallbackItems.length === 0 || fallbackItems.every((item) => item === '- None')) {
		return summary
	}

	const summaryItems = extractSectionItems(summary, SUMMARY_IMPORTANT_DETAILS_HEADING)
	const missingItems = fallbackItems.filter((item) => !summaryItems.includes(item))
	if (missingItems.length === 0) {
		return summary
	}

	const parsed = parseStructuredSummary(summary)
	const importantSection = parsed.sections.find(
		(section) => section.heading === SUMMARY_IMPORTANT_DETAILS_HEADING
	)
	if (!importantSection) {
		parsed.sections.push({
			heading: SUMMARY_IMPORTANT_DETAILS_HEADING,
			items: [...missingItems],
		})
		return renderStructuredSummary(parsed)
	}

	for (const item of missingItems) {
		if (!importantSection.items.includes(item)) {
			importantSection.items.push(item)
		}
	}

	return renderStructuredSummary(parsed)
}

const extractSectionItems = (summary: string, heading: string): string[] => {
	const lines = summary.split('\n')
	const items: string[] = []
	let collecting = false

	for (const line of lines) {
		if (line === heading) {
			collecting = true
			continue
		}
		if (!collecting) {
			continue
		}
		if (SUMMARY_HEADINGS.includes(line as (typeof SUMMARY_HEADINGS)[number])) {
			break
		}
		if (line.startsWith('- ')) {
			items.push(line)
		}
	}

	return items
}

const parseStructuredSummary = (summary: string): StructuredSummary => {
	const lines = summary.trim().split('\n')
	const preamble: string[] = []
	const sections: StructuredSummary['sections'] = []
	let currentSection: StructuredSummary['sections'][number] | null = null

	for (const line of lines) {
		if (SUMMARY_HEADINGS.includes(line as (typeof SUMMARY_HEADINGS)[number])) {
			currentSection = { heading: line, items: [] }
			sections.push(currentSection)
			continue
		}
		if (!currentSection) {
			preamble.push(line)
			continue
		}
		if (line.startsWith('- ')) {
			currentSection.items.push(line)
		} else if (line.trim()) {
			currentSection.items.push(`- ${line.trim()}`)
		}
	}

	for (const heading of SUMMARY_HEADINGS) {
		if (!sections.some((section) => section.heading === heading)) {
			sections.push({ heading, items: ['- None'] })
		}
	}

	return { preamble, sections }
}

const renderStructuredSummary = (summary: StructuredSummary): string => {
	const lines: string[] = []
	const preamble = summary.preamble.filter((line) => line.trim().length > 0)
	if (preamble.length > 0) {
		lines.push(...preamble, '')
	}

	for (const heading of SUMMARY_HEADINGS) {
		const section = summary.sections.find((item) => item.heading === heading)
		lines.push(heading, ...(section?.items.length ? section.items : ['- None']), '')
	}

	return lines.join('\n').trim()
}

const extractToolTarget = (args: Record<string, unknown>): string | null => {
	const candidate = args.filePath ?? args.path ?? args.file ?? args.target ?? args.url ?? args.uri
	return typeof candidate === 'string' && candidate.trim().length > 0
		? candidate.trim()
		: null
}

const normalizeText = (content: string): string =>
	String(content ?? '')
		.replace(/<!-- FF_AGENT_EVENTS_START -->[\s\S]*?<!-- FF_AGENT_EVENTS_END -->/g, ' ')
		.replace(/\{\{FF_MCP_TOOL_START\}\}[\s\S]*?\{\{FF_MCP_TOOL_END\}\}/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()

const compactLine = (content: string, maxChars = MAX_SUMMARY_LINE_CHARS): string => {
	const normalized = normalizeText(content)
	if (!normalized) {
		return ''
	}
	if (normalized.length <= maxChars) {
		return normalized
	}
	return `${normalized.slice(0, Math.max(0, maxChars - 1)).trim()}…`
}

const looksLikeDecision = (content: string): boolean =>
	/决定|采用|改为|使用|保留|切换|改成|方案|策略|计划|rewrite|reuse|keep|switch/i.test(
		content
	)

const toBulletLines = (items: string[], limit = MAX_SECTION_ITEMS): string[] =>
	items.length === 0
		? ['- None']
		: items.slice(0, limit).map((item) => `- ${item}`)

const pushUnique = (collection: string[], value: string): void => {
	if (!value || collection.includes(value) || collection.length >= MAX_SECTION_ITEMS) {
		return
	}
	collection.push(value)
}
