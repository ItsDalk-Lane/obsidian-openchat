import {
	compactSummaryLine,
	HISTORY_SUMMARY_HEADER,
	HISTORY_SUMMARY_INTRO,
	SUMMARY_CONTEXT_HEADING,
	SUMMARY_CURRENT_STATE_HEADING,
	SUMMARY_DECISIONS_HEADING,
	SUMMARY_HEADINGS,
	SUMMARY_IMPORTANT_DETAILS_HEADING,
	SUMMARY_OPEN_ITEMS_HEADING,
} from './service-history-summary-shared'

interface StructuredSummary {
	preamble: string[]
	sections: Array<{ heading: string; items: string[] }>
}

export const normalizeGeneratedHistorySummary = (
	summary: string | null,
	fallback: string,
): string => {
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

export const fitHistorySummaryToBudget = (
	summary: string,
	targetBudgetTokens: number,
	estimateTokens: (value: string) => number,
): string => {
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
						: `- ${compactSummaryLine(item.slice(2), maxChars)}`,
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
		(section) => section.heading === SUMMARY_IMPORTANT_DETAILS_HEADING,
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