export const REASONING_START_MARKER = '{{FF_REASONING_START}}'
export const REASONING_END_MARKER = '{{FF_REASONING_END}}'
export const MCP_TOOL_START_MARKER = '{{FF_MCP_TOOL_START}}'
export const MCP_TOOL_END_MARKER = '{{FF_MCP_TOOL_END}}'

export interface ReasoningBlock {
	type: 'reasoning'
	startMs: number
	content: string
	durationMs?: number
}

export interface TextBlock {
	type: 'text'
	content: string
}

export interface McpToolBlock {
	type: 'mcpTool'
	toolName: string
	content: string
	toolIndex: number
}

export type ContentBlock = ReasoningBlock | TextBlock | McpToolBlock

type MarkerEntry = {
	index: number
	type: 'reasoning' | 'mcpTool'
	match: RegExpExecArray
}

const ESCAPED_REASONING_START = REASONING_START_MARKER.replace(/[{}]/g, '\\$&')
const ESCAPED_REASONING_END = REASONING_END_MARKER.replace(/[{}]/g, '\\$&')
const ESCAPED_MCP_TOOL_START = MCP_TOOL_START_MARKER.replace(/[{}]/g, '\\$&')
const ESCAPED_MCP_TOOL_END = MCP_TOOL_END_MARKER.replace(/[{}]/g, '\\$&')

export const formatMcpToolBlock = (toolName: string, content: string): string =>
	`${MCP_TOOL_START_MARKER}:${toolName}:${content}${MCP_TOOL_END_MARKER}:`

export const parseContentBlocks = (content: string): ContentBlock[] => {
	const blocks: ContentBlock[] = []
	const markers: MarkerEntry[] = []

	const reasoningStartPattern = new RegExp(
		`${ESCAPED_REASONING_START}:(\\d+):`,
		'g',
	)
	let match: RegExpExecArray | null
	while ((match = reasoningStartPattern.exec(content)) !== null) {
		markers.push({ index: match.index, type: 'reasoning', match })
	}

	const mcpStartPattern = new RegExp(`${ESCAPED_MCP_TOOL_START}:([^:]+):`, 'g')
	while ((match = mcpStartPattern.exec(content)) !== null) {
		markers.push({ index: match.index, type: 'mcpTool', match })
	}

	markers.sort((left, right) => left.index - right.index)

	const reasoningEndPattern = new RegExp(`:${ESCAPED_REASONING_END}:(\\d+):?`)
	const mcpEndPattern = new RegExp(`${ESCAPED_MCP_TOOL_END}:`)

	let lastIndex = 0
	let toolIndex = 0

	for (const marker of markers) {
		if (marker.index < lastIndex) {
			continue
		}

		if (marker.index > lastIndex) {
			const textBefore = content.slice(lastIndex, marker.index)
			if (textBefore.trim()) {
				blocks.push({ type: 'text', content: textBefore })
			}
		}

		const blockContentStart = marker.index + marker.match[0].length
		const remainingContent = content.slice(blockContentStart)

		if (marker.type === 'reasoning') {
			const startMs = Number.parseInt(marker.match[1], 10)
			const endMatch = reasoningEndPattern.exec(remainingContent)

			if (endMatch) {
				blocks.push({
					type: 'reasoning',
					startMs,
					content: remainingContent.slice(0, endMatch.index),
					durationMs: Number.parseInt(endMatch[1], 10),
				})
				lastIndex = blockContentStart + endMatch.index + endMatch[0].length
				continue
			}

			blocks.push({
				type: 'reasoning',
				startMs,
				content: remainingContent,
			})
			lastIndex = content.length
			continue
		}

		const toolName = marker.match[1]
		const endMatch = mcpEndPattern.exec(remainingContent)

		if (endMatch) {
			blocks.push({
				type: 'mcpTool',
				toolName,
				content: remainingContent.slice(0, endMatch.index),
				toolIndex,
			})
			toolIndex += 1
			lastIndex = blockContentStart + endMatch.index + endMatch[0].length
			continue
		}

		blocks.push({
			type: 'mcpTool',
			toolName,
			content: remainingContent,
			toolIndex,
		})
		toolIndex += 1
		lastIndex = content.length
	}

	if (lastIndex < content.length) {
		const textAfter = content.slice(lastIndex)
		if (textAfter.trim()) {
			blocks.push({ type: 'text', content: textAfter })
		}
	}

	if (blocks.length === 0 && content.trim()) {
		blocks.push({ type: 'text', content })
	}

	return blocks
}