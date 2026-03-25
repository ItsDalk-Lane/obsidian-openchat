import { parseContentBlocks } from 'src/core/chat/utils/markdown'
import { formatReasoningDuration } from 'src/LLMProviders/utils'
import type { ChatMessage, ChatRole, SelectedFile, SelectedFolder } from '../types/chat'
import type { ToolCall } from '../types/tools'

interface SerializeHistoryMessageOptions {
	selectedFiles?: SelectedFile[]
	selectedFolders?: SelectedFolder[]
	formatTimestamp: (timestamp: number) => string
	mapRoleToLabel: (role: ChatRole) => string
}

export const serializeHistoryMessage = (
	message: ChatMessage,
	options: SerializeHistoryMessageOptions,
): string => {
	const timestamp = options.formatTimestamp(message.timestamp)
	const roleLabel = options.mapRoleToLabel(message.role)
	const modelSuffix = message.modelTag ? ` [${message.modelTag}]` : ''
	const images = (message.images ?? [])
		.map((image, index) => `![Image ${index + 1}](${image})`)
		.join('\n')

	let content = formatReasoningBlocksForHistory(message.content)
	content = formatMcpToolBlocksForHistory(content)
	if (message.isError) {
		content = `[错误] ${content}`
	}

	let fullMessage = `# ${roleLabel}${modelSuffix} (${timestamp})\n${content}`
	if (message.taskDescription) {
		fullMessage += `\n\n> 任务: ${message.taskDescription}`
	}
	if (message.modelName && message.modelName !== message.modelTag) {
		fullMessage += `\n\n> 模型名称: ${message.modelName}`
	}
	if (typeof message.executionIndex === 'number') {
		fullMessage += `\n\n> 执行序号: ${message.executionIndex}`
	}
	if (message.parallelGroupId) {
		fullMessage += `\n\n> 对比组: ${message.parallelGroupId}`
	}
	if (message.metadata?.pinned === true) {
		fullMessage += '\n\n> 置顶: true'
	}
	if (typeof message.metadata?.selectedText === 'string') {
		fullMessage += `\n\n> 选中文本:\n> ${message.metadata.selectedText.split('\n').join('\n> ')}`
	}

	if (message.role === 'user' && (options.selectedFiles || options.selectedFolders)) {
		const fileTags = (options.selectedFiles ?? []).map((file) => `[[${file.path}]]`)
		const folderTags = (options.selectedFolders ?? []).map((folder) => `#${folder.path}`)
		if (fileTags.length > 0 || folderTags.length > 0) {
			fullMessage += `\n\n**附件:** ${[...fileTags, ...folderTags].join(' ')}`
		}
	}

	const hasMcpToolMarkers = message.content?.includes('{{FF_MCP_TOOL_START}}')
	if (!hasMcpToolMarkers && message.toolCalls && message.toolCalls.length > 0) {
		const displayBlock = formatToolCallsForHistory(message.toolCalls)
		if (displayBlock) {
			fullMessage += `\n\n${displayBlock}`
		}
	}

	const subAgentStates = (message.metadata?.subAgentStates as Record<string, import('src/tools/sub-agents').SubAgentExecutionState>) ?? {}
	if (Object.keys(subAgentStates).length > 0) {
		const subAgentBlock = formatSubAgentStatesForHistory(
			subAgentStates,
			options.formatTimestamp,
		)
		if (subAgentBlock) {
			fullMessage += `\n\n${subAgentBlock}`
		}
	}

	if (images) {
		fullMessage += `\n\n${images}`
	}

	return fullMessage
}

const formatToolCallsForHistory = (toolCalls: ToolCall[]): string => {
	if (!toolCalls.length) return ''

	const lines: string[] = []
	const first = toolCalls[0]
	const firstSummary = buildToolCallSummary(first)
	lines.push(`> [!info]- **${first.name}**${firstSummary ? ` ${firstSummary}` : ''}`)

	for (const [index, call] of toolCalls.entries()) {
		if (index > 0) {
			const summary = buildToolCallSummary(call)
			lines.push(`> **${call.name}**${summary ? ` ${summary}` : ''}`)
		}

		const content = getToolCallContent(call)
		if (content) {
			lines.push('> ```text')
			for (const line of content.split('\n')) {
				lines.push(`> ${line}`)
			}
			lines.push('> ```')
		}

		if (call.result?.trim()) {
			lines.push(`> 结果: ${formatToolResultForHistory(call.result)}`)
		}
		lines.push('>')
	}

	return lines.join('\n').trim()
}

const buildToolCallSummary = (call: ToolCall): string => {
	const args = call.arguments ?? {}
	const filePath = args.filePath ?? args.path ?? args.file ?? args.target
	if (typeof filePath === 'string' && filePath.trim().length > 0) {
		return typeof args.content === 'string'
			? `${filePath}（${args.content.length}字）`
			: filePath
	}
	const url = args.url ?? args.uri ?? args.link
	if (typeof url === 'string' && url.trim().length > 0) {
		return url
	}
	const name = args.name ?? args.title ?? args.query
	return typeof name === 'string' && name.trim().length > 0 ? name : ''
}

const getToolCallContent = (call: ToolCall): string => {
	const raw = (call.arguments ?? {}).content
	if (typeof raw === 'string') return raw
	try {
		const text = JSON.stringify(raw ?? {}, null, 2)
		return text === '{}' ? '' : text
	} catch {
		return ''
	}
}

const formatToolResultForHistory = (result: string): string => {
	try {
		const parsed = JSON.parse(result) as { message?: string; characterCount?: number }
		if (parsed && typeof parsed === 'object') {
			if (typeof parsed.message === 'string') {
				return parsed.characterCount === 0 ? `${parsed.message} (空文件)` : parsed.message
			}
			return JSON.stringify(parsed)
		}
		return result
	} catch {
		return result
	}
}

const formatReasoningBlocksForHistory = (content: string): string => {
	if (!content || !content.includes('{{FF_REASONING_START}}')) {
		return content
	}

	let result = ''
	for (const block of parseContentBlocks(content)) {
		if (block.type === 'text') {
			result += block.content
			continue
		}
		if (block.type === 'mcpTool') {
			result += `{{FF_MCP_TOOL_START}}:${block.toolName}:${block.content}{{FF_MCP_TOOL_END}}:`
			continue
		}

		const title = block.durationMs
			? `深度思考 ${formatReasoningDuration(block.durationMs)}`
			: '深度思考'
		const quotedLines = (block.content ?? '')
			.replace(/\s+$/g, '')
			.split('\n')
			.map((line) => (line ? `> ${line}` : '>'))
			.join('\n')
		result += `\n\n> [!danger]- ${title}\n${quotedLines}\n\n`
	}

	return result.replace(/\n{3,}/g, '\n\n')
}

const formatMcpToolBlocksForHistory = (content: string): string => {
	if (!content || !content.includes('{{FF_MCP_TOOL_START}}')) {
		return content
	}

	return content
		.replace(/\{\{FF_MCP_TOOL_START\}\}:([^:]+):([\s\S]*?)\{\{FF_MCP_TOOL_END\}\}:/g, (_, toolName: string, toolContent: string) => {
			if (toolName.startsWith('sub_agent_')) {
				return ''
			}
			const quotedLines = (toolContent ?? '')
				.replace(/\s+$/g, '')
				.split('\n')
				.map((line: string) => (line ? `> ${line}` : '>'))
				.join('\n')
			return `\n\n> [!info]- ${toolName}\n${quotedLines}\n\n`
		})
		.replace(/\n{3,}/g, '\n\n')
}

const formatSubAgentStatesForHistory = (
	subAgentStates: Record<string, import('src/tools/sub-agents').SubAgentExecutionState>,
	formatTimestamp: (timestamp: number) => string,
): string => {
	const entries = Object.entries(subAgentStates)
	if (entries.length === 0) return ''

	const statusLabel: Record<string, string> = {
		running: '执行中',
		completed: '已完成',
		failed: '失败',
		cancelled: '已取消',
	}
	const lines: string[] = []

	for (const [, state] of entries) {
		const filteredMessages = (state.internalMessages ?? []).filter((msg) => {
			if (msg.role === 'system') return false
			if (
				msg.role === 'tool'
				&& (state.internalMessages ?? []).some(
					(item) => item.role === 'assistant' && item.content?.includes('{{FF_MCP_TOOL_START}}')
				)
			) {
				return false
			}
			return true
		})

		lines.push(
			`> [!quote]- 🤖 ${state.name} (${statusLabel[state.status] ?? state.status}, ${filteredMessages.length}条消息)`
		)

		for (const msg of filteredMessages) {
			const roleLabel = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? 'AI' : '系统'
			lines.push(`> ### ${roleLabel} (${formatTimestamp(msg.timestamp)})`)
			if (msg.content) {
				for (const line of formatMcpToolBlocksForHistory(msg.content).split('\n')) {
					lines.push(`> ${line}`)
				}
			}
			if (msg.toolCalls?.length) {
				for (const line of formatToolCallsForHistory(msg.toolCalls).split('\n')) {
					lines.push(`> ${line}`)
				}
			}
			lines.push('>')
		}
		lines.push('')
	}

	return lines.join('\n').trim()
}
