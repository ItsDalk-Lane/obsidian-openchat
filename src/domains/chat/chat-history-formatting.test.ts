import assert from 'node:assert/strict'
import test from 'node:test'
import {
	parseMcpToolBlocksFromHistory,
	parseReasoningBlocksFromHistory,
} from './service-history-parsing'
import {
	MCP_TOOL_END_MARKER,
	MCP_TOOL_START_MARKER,
	parseContentBlocks,
	REASONING_END_MARKER,
	REASONING_START_MARKER,
} from './service-content-blocks'
import { serializeHistoryMessage } from './service-history-formatting'
import type { ChatMessage } from './types'

const createMessage = (
	content: string,
	extras?: Partial<ChatMessage>,
): ChatMessage => ({
	id: extras?.id ?? 'message-1',
	role: extras?.role ?? 'assistant',
	content,
	timestamp: extras?.timestamp ?? 1,
	images: extras?.images ?? [],
	isError: extras?.isError ?? false,
	metadata: extras?.metadata ?? {},
	toolCalls: extras?.toolCalls ?? [],
	modelTag: extras?.modelTag,
	modelName: extras?.modelName,
	taskDescription: extras?.taskDescription,
	executionIndex: extras?.executionIndex,
	parallelGroupId: extras?.parallelGroupId,
})

const createOptions = () => ({
	formatTimestamp: () => '2026-03-28 08:00:00',
	mapRoleToLabel: () => 'AI',
})

test('parseContentBlocks 解析混合块并保持 MCP tool 顺序', () => {
	const content = [
		'前置文本',
		`${REASONING_START_MARKER}:100:先分析\n再执行:${REASONING_END_MARKER}:1500:`,
		'中间正文',
		`${MCP_TOOL_START_MARKER}:fetch_url:https://example.com${MCP_TOOL_END_MARKER}:`,
		'尾部',
		`${MCP_TOOL_START_MARKER}:search:query${MCP_TOOL_END_MARKER}:`,
	].join('')

	const blocks = parseContentBlocks(content)

	assert.deepEqual(
		blocks.map((block) => block.type),
		['text', 'reasoning', 'text', 'mcpTool', 'text', 'mcpTool'],
	)
	assert.equal(blocks[1]?.type, 'reasoning')
	assert.equal(blocks[1]?.durationMs, 1500)
	assert.equal(blocks[3]?.type, 'mcpTool')
	assert.equal(blocks[3]?.toolIndex, 0)
	assert.equal(blocks[5]?.type, 'mcpTool')
	assert.equal(blocks[5]?.toolIndex, 1)
})

test('serializeHistoryMessage 产出的 reasoning 与 MCP callout 可被解析 helper 恢复', () => {
	const content = [
		'正文',
		`${REASONING_START_MARKER}:100:先分析\n再执行:${REASONING_END_MARKER}:1500:`,
		'尾部',
		`${MCP_TOOL_START_MARKER}:fetch_url:https://example.com${MCP_TOOL_END_MARKER}:`,
	].join('')
	const serialized = serializeHistoryMessage(createMessage(content), createOptions())

	assert.match(serialized, /> \[!danger\]- 深度思考 1\.50s/)
	assert.match(serialized, /> \[!info\]- fetch_url/)

	const restored = parseMcpToolBlocksFromHistory(
		parseReasoningBlocksFromHistory(serialized),
	)

	assert.match(
		restored,
		new RegExp(
			`\\{\\{FF_REASONING_START\\}\\}:\\d+:先分析\\n再执行:`,
		),
	)
	assert.ok(
		restored.includes(
			`${MCP_TOOL_START_MARKER}:fetch_url:https://example.com${MCP_TOOL_END_MARKER}:`,
		),
	)
})

test('serializeHistoryMessage 在已有 MCP 标记时不重复追加 tool call 历史块', () => {
	const serialized = serializeHistoryMessage(
		createMessage(
			`${MCP_TOOL_START_MARKER}:fetch_url:https://example.com${MCP_TOOL_END_MARKER}:`,
			{
				toolCalls: [{
					id: 'tool-1',
					name: 'fetch_url',
					arguments: { url: 'https://example.com' },
					result: 'ok',
					status: 'completed',
					timestamp: 1,
				}],
			},
		),
		createOptions(),
	)

	assert.equal(serialized.match(/> \[!info\]- fetch_url/g)?.length ?? 0, 1)
	assert.equal(serialized.includes('> 结果: ok'), false)
})