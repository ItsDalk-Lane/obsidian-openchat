/**
 * @module mcp/internal/tool-result
 * @description 负责把 MCP tools/call 结果序列化为适合聊天上下文消费的文本。
 *
 * @dependencies 无
 * @side-effects 无
 * @invariants 结构化内容会被规范排序，超长结果会被安全截断。
 */

const DEFAULT_TOOL_RESULT_TEXT_LIMIT = 25_000

export interface McpToolResultContentItem {
	type?: string
	text?: string
	[key: string]: unknown
}

export interface McpToolResultLike {
	structuredContent?: Record<string, unknown>
	content?: McpToolResultContentItem[]
	isError?: boolean
}

const toJsonText = (value: unknown): string => {
	try {
		return JSON.stringify(value, null, 2)
	} catch (error) {
		return String(error instanceof Error ? error.message : value)
	}
}

const sortJsonValue = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value.map((item) => sortJsonValue(item))
	}
	if (value && typeof value === 'object') {
		return Object.keys(value as Record<string, unknown>)
			.sort((left, right) => left.localeCompare(right))
			.reduce<Record<string, unknown>>((result, key) => {
				result[key] = sortJsonValue((value as Record<string, unknown>)[key])
				return result
			}, {})
	}
	return value
}

const toCanonicalJsonText = (value: unknown): string => toJsonText(sortJsonValue(value))

const isStructuredContent = (value: unknown): value is Record<string, unknown> => {
	return !!value && typeof value === 'object' && !Array.isArray(value)
}

const serializeContentItem = (item: McpToolResultContentItem): string => {
	if (item.type === 'text' && typeof item.text === 'string') {
		return item.text
	}
	return toJsonText(item)
}

const truncateToolResultText = (text: string): string => {
	if (text.length <= DEFAULT_TOOL_RESULT_TEXT_LIMIT) {
		return text
	}
	return `${text.slice(0, DEFAULT_TOOL_RESULT_TEXT_LIMIT)}\n\n[结果已截断，请缩小查询范围或改用更具体的参数]`
}

/** @precondition result 为 MCP tools/call 返回值的兼容形态 @postcondition 返回适合模型上下文消费的文本结果 @throws 从不抛出 @example serializeMcpToolResult({ content: [{ type: 'text', text: 'ok' }] }) */
export function serializeMcpToolResult(result: McpToolResultLike): string {
	const text = truncateToolResultText(
		isStructuredContent(result.structuredContent)
			? toCanonicalJsonText(result.structuredContent)
			: (result.content ?? [])
				.map((item) => serializeContentItem(item))
				.filter((item) => item.length > 0)
				.join('\n'),
	)
	if (result.isError) {
		return `[工具执行错误] ${text}`
	}
	return text
}