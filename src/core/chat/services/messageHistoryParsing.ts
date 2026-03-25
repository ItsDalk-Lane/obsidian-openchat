import { v4 as uuidv4 } from 'uuid'
import type { ChatMessage } from '../types/chat'
import type { ToolCall } from '../types/tools'

export const extractToolCallsFromHistory = (content: string): {
	content: string
	toolCalls?: ToolCall[]
} => {
	if (!content) {
		return { content }
	}

	const { cleanedContent, toolCalls } = parseToolCallsFromCallout(content)
	return { content: cleanedContent, toolCalls }
}

export const parseMcpToolBlocksFromHistory = (content: string): string => {
	if (!content || !content.includes('> [!info]-')) {
		return content
	}

	return content.replace(
		/> \[!info\]- (?!\*\*)([^\n]+)\n((?:>[^\n]*(?:\n|$))+)/g,
		(_match: string, toolName: string, quotedContent: string) => {
			const toolContent = quotedContent
				.split('\n')
				.map((line: string) => line.replace(/^>\s*/, ''))
				.filter((line: string) => line.length > 0)
				.join('\n')
			return `{{FF_MCP_TOOL_START}}:${toolName}:${toolContent}{{FF_MCP_TOOL_END}}:`
		},
	)
}

export const parseReasoningBlocksFromHistory = (content: string): string => {
	if (!content || !content.includes('> [!danger]')) {
		return content
	}

	const calloutPattern = /> \[!danger\]- (深度思考(?:\s+\d+\.?\d*s)?)\n((?:>[^\n]*(?:\n|$))+)/g
	let result = content
	let match: RegExpExecArray | null

	while ((match = calloutPattern.exec(content)) !== null) {
		const durationMatch = match[1].match(/(\d+\.?\d*)s/)
		const durationMs = durationMatch
			? Math.round(Number.parseFloat(durationMatch[1]) * 1000)
			: undefined
		const reasoningContent = match[2]
			.split('\n')
			.map((line) => line.replace(/^>\s*/, '').trim())
			.filter((line) => line.length > 0)
			.join('\n')
		const startMs = durationMs ? Date.now() - durationMs : Date.now()
		const reasoningBlock =
			durationMs !== undefined
				? `{{FF_REASONING_START}}:${startMs}:${reasoningContent}:{{FF_REASONING_END}}:${durationMs}`
				: `{{FF_REASONING_START}}:${startMs}:${reasoningContent}`
		result = result.replace(match[0], reasoningBlock)
	}

	return result
}

export const parseSubAgentStatesFromHistory = (
	content: string,
	createMessage: (
		role: ChatMessage['role'],
		text: string,
		extras?: Partial<ChatMessage>,
	) => ChatMessage,
): {
	cleanedContent: string
	subAgentStates: Record<string, import('src/tools/sub-agents').SubAgentExecutionState>
} => {
	const subAgentStates: Record<string, import('src/tools/sub-agents').SubAgentExecutionState> = {}
	if (!content || !content.includes('> [!quote]- 🤖')) {
		return { cleanedContent: content, subAgentStates }
	}

	const calloutPattern = /> \[!quote\]- 🤖 ([^(]+)\s*\(([^,]+),\s*(\d+)条消息\)\n((?:>[^\n]*\n?)+)/g
	let result = content
	let match: RegExpExecArray | null
	let stateIndex = 0

	while ((match = calloutPattern.exec(content)) !== null) {
		let status: 'running' | 'completed' | 'failed' | 'cancelled' = 'completed'
		if (match[2].trim() === '执行中') status = 'running'
		else if (match[2].trim() === '失败') status = 'failed'
		else if (match[2].trim() === '已取消') status = 'cancelled'

		const toolCallId = `subagent-history-${Date.now()}-${stateIndex}`
		subAgentStates[toolCallId] = {
			name: match[1].trim(),
			status,
			internalMessages: parseSubAgentInternalMessages(match[4], createMessage),
			folded: true,
			toolCallId,
		}
		stateIndex += 1
		result = result.replace(match[0], '')
	}

	return {
		cleanedContent: result.replace(/\n{3,}/g, '\n\n').trim(),
		subAgentStates,
	}
}

const parseToolCallsFromCallout = (content: string): {
	cleanedContent: string
	toolCalls?: ToolCall[]
} => {
	const lines = content.split('\n')
	const output: string[] = []
	const toolCalls: ToolCall[] = []
	let index = 0

	const parseSummaryToArgs = (summary: string): Record<string, unknown> => {
		const match = summary.trim().match(/^(.*?)(?:（(\d+)字）)?$/)
		return match?.[1]?.trim() ? { filePath: match[1].trim() } : {}
	}

	const parseBlock = (blockLines: string[]) => {
		let current: ToolCall | null = null
		let inCode = false
		let codeLines: string[] = []
		let currentArgs: Record<string, unknown> = {}

		const flush = () => {
			if (!current) return
			if (Object.keys(currentArgs).length > 0) {
				current.arguments = { ...(current.arguments ?? {}), ...currentArgs }
			}
			if (codeLines.length > 0) {
				current.arguments = { ...(current.arguments ?? {}), content: codeLines.join('\n') }
			}
			toolCalls.push(current)
			current = null
			currentArgs = {}
			codeLines = []
		}

		for (const rawLine of blockLines) {
			const line = rawLine.replace(/^>\s?/, '')
			const headerLine = line.startsWith('[!info]- ') ? line.replace('[!info]- ', '') : line
			const entryMatch = headerLine.match(/^\*\*(.+?)\*\*(.*)$/)
			if (entryMatch) {
				flush()
				currentArgs = parseSummaryToArgs(entryMatch[2] ? entryMatch[2].trim() : '')
				current = {
					id: uuidv4(),
					name: entryMatch[1].trim(),
					arguments: {},
					status: 'completed',
					timestamp: Date.now(),
				}
				inCode = false
				continue
			}

			if (line.trim().startsWith('```')) {
				inCode = !inCode
				if (inCode) {
					codeLines = []
				}
				continue
			}

			if (line.startsWith('结果:')) {
				if (current) {
					current.result = line.replace(/^结果:\s*/, '').trim()
				}
				continue
			}

			if (inCode) {
				codeLines.push(line)
			}
		}

		flush()
	}

	while (index < lines.length) {
		if (lines[index].startsWith('> [!info]- **')) {
			let endIndex = index
			while (endIndex + 1 < lines.length && lines[endIndex + 1].startsWith('>')) {
				endIndex += 1
			}
			parseBlock(lines.slice(index, endIndex + 1))
			index = endIndex + 1
			continue
		}
		output.push(lines[index])
		index += 1
	}

	return {
		cleanedContent: output.join('\n').trim(),
		toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
	}
}

const parseSubAgentInternalMessages = (
	blockContent: string,
	createMessage: (
		role: ChatMessage['role'],
		text: string,
		extras?: Partial<ChatMessage>,
	) => ChatMessage,
): ChatMessage[] => {
	const messages: ChatMessage[] = []
	const lines = blockContent.split('\n')
	let currentRole: 'user' | 'assistant' | 'system' = 'user'
	let currentContent = ''
	let currentTimestamp = Date.now()
	let inMessage = false

	for (const line of lines) {
		const headerMatch = line.match(/^>\s*###\s+(用户|AI|系统)\s*\(([^)]+)\)/)
		if (headerMatch) {
			if (inMessage && currentContent.trim()) {
				messages.push(createMessage(currentRole, currentContent.trim(), { timestamp: currentTimestamp }))
			}

			currentRole =
				headerMatch[1].trim() === 'AI'
					? 'assistant'
					: headerMatch[1].trim() === '系统'
						? 'system'
						: 'user'
			try {
				const dateMatch = headerMatch[2]
					.trim()
					.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/)
				if (dateMatch) {
					const [, year, month, day, hour, minute, second] = dateMatch.map(Number)
					currentTimestamp = new Date(year, month - 1, day, hour, minute, second).getTime()
				}
			} catch {
				currentTimestamp = Date.now()
			}
			currentContent = ''
			inMessage = true
			continue
		}

		if (inMessage) {
			currentContent += `${line.replace(/^>\s?/, '')}\n`
		}
	}

	if (inMessage && currentContent.trim()) {
		messages.push(createMessage(currentRole, currentContent.trim(), { timestamp: currentTimestamp }))
	}

	return messages
}
