import assert from 'node:assert/strict'
import test from 'node:test'
import {
	buildHistorySummary,
} from './service-history-summary'
import {
	fitHistorySummaryToBudget,
	normalizeGeneratedHistorySummary,
} from './service-history-summary-budget'
import {
	HISTORY_SUMMARY_HEADER,
	HISTORY_SUMMARY_INTRO,
	SUMMARY_CONTEXT_HEADING,
	SUMMARY_CURRENT_STATE_HEADING,
	SUMMARY_DECISIONS_HEADING,
	SUMMARY_IMPORTANT_DETAILS_HEADING,
	SUMMARY_OPEN_ITEMS_HEADING,
} from './service-history-summary-shared'
import {
	REASONING_END_MARKER,
	REASONING_START_MARKER,
} from './service-content-blocks'
import type { ChatMessage } from './types'

const createMessage = (
	role: ChatMessage['role'],
	content: string,
	extras?: Partial<ChatMessage>,
): ChatMessage => ({
	id: extras?.id ?? `${role}-${content}`,
	role,
	content,
	timestamp: extras?.timestamp ?? 1,
	images: extras?.images ?? [],
	isError: extras?.isError ?? false,
	metadata: extras?.metadata ?? {},
	toolCalls: extras?.toolCalls ?? [],
})

const buildStructuredSummary = (sections: {
	context: string[]
	decisions: string[]
	currentState: string[]
	importantDetails: string[]
	openItems: string[]
}): string => [
	HISTORY_SUMMARY_HEADER,
	HISTORY_SUMMARY_INTRO,
	'',
	SUMMARY_CONTEXT_HEADING,
	...sections.context.map((item) => `- ${item}`),
	'',
	SUMMARY_DECISIONS_HEADING,
	...sections.decisions.map((item) => `- ${item}`),
	'',
	SUMMARY_CURRENT_STATE_HEADING,
	...sections.currentState.map((item) => `- ${item}`),
	'',
	SUMMARY_IMPORTANT_DETAILS_HEADING,
	...sections.importantDetails.map((item) => `- ${item}`),
	'',
	SUMMARY_OPEN_ITEMS_HEADING,
	...sections.openItems.map((item) => `- ${item}`),
].join('\n')

test('buildHistorySummary 统计 reasoning 但不混入 assistant 可见文本', () => {
	const result = buildHistorySummary(
		[
			createMessage('user', '请继续迁移 chat summary helper'),
			createMessage(
				'assistant',
				`正文前${REASONING_START_MARKER}:100:推理 A:${REASONING_END_MARKER}:1200:正文后${REASONING_START_MARKER}:200:推理 B:${REASONING_END_MARKER}:800:`,
			),
		],
		500,
	)

	assert.equal(result.droppedReasoningCount, 2)
	assert.match(result.summary, /\[CURRENT STATE\]\n- 正文前 正文后/)
})

test('buildHistorySummary 提取 constraint、path 与 tool detail', () => {
	const result = buildHistorySummary(
		[
			createMessage(
				'user',
				[
					'必须保留原始格式',
					'不允许删除 frontmatter',
					'请查看 `src/core/chat.ts`',
				].join('\n'),
			),
			createMessage('assistant', '已读取文件', {
				toolCalls: [{
					id: 'tool-1',
					name: 'read_file',
					arguments: { filePath: 'src/core/chat.ts' },
					result: 'export function test() {}',
					status: 'completed',
					timestamp: 1,
				}],
			}),
		],
		800,
	)

	assert.match(result.summary, /Requirement: 必须保留原始格式/)
	assert.match(result.summary, /Prohibition: 不允许删除 frontmatter/)
	assert.match(result.summary, /Path: src\/core\/chat\.ts/)
	assert.match(
		result.summary,
		/Tool: read_file · src\/core\/chat\.ts · 结果: export function test\(\) \{\}/,
	)
})

test('normalizeGeneratedHistorySummary 在结构缺失时回退，并回补遗漏的重要细节', () => {
	const fallback = buildStructuredSummary({
		context: ['fallback context'],
		decisions: ['fallback decision'],
		currentState: ['fallback state'],
		importantDetails: [
			'Path: src/a.ts',
			'Tool: read_file · src/core/chat.ts',
		],
		openItems: ['fallback open'],
	})

	assert.equal(
		normalizeGeneratedHistorySummary('[CONTEXT]\n- only context', fallback),
		fallback,
	)

	const merged = normalizeGeneratedHistorySummary(
		[
			SUMMARY_CONTEXT_HEADING,
			'- generated context',
			'',
			SUMMARY_DECISIONS_HEADING,
			'- generated decision',
			'',
			SUMMARY_CURRENT_STATE_HEADING,
			'- generated state',
			'',
			SUMMARY_IMPORTANT_DETAILS_HEADING,
			'- Path: src/a.ts',
			'',
			SUMMARY_OPEN_ITEMS_HEADING,
			'- generated open',
		].join('\n'),
		fallback,
	)

	assert.match(merged, /\[Earlier conversation summary\]/)
	assert.match(merged, /- generated context/)
	assert.match(merged, /- Path: src\/a\.ts/)
	assert.match(merged, /- Tool: read_file · src\/core\/chat\.ts/)
})

test('fitHistorySummaryToBudget 按既定顺序裁掉非关键 section item', () => {
	const fitted = fitHistorySummaryToBudget(
		buildStructuredSummary({
			context: ['context-1', 'context-2'],
			decisions: ['decision-1', 'decision-2'],
			currentState: ['state-1', 'state-2'],
			importantDetails: ['detail-1', 'detail-2'],
			openItems: ['open-1', 'open-2'],
		}),
		4,
		(value) =>
			value
				.split('\n')
				.filter(
					(line) =>
						line.startsWith('- ')
						&& !line.includes('detail-1')
						&& !line.includes('detail-2'),
				)
				.length,
	)

	assert.match(fitted, /- context-1/)
	assert.doesNotMatch(fitted, /- context-2/)
	assert.match(fitted, /- decision-1/)
	assert.doesNotMatch(fitted, /- decision-2/)
	assert.match(fitted, /- state-1/)
	assert.doesNotMatch(fitted, /- state-2/)
	assert.match(fitted, /- open-1/)
	assert.doesNotMatch(fitted, /- open-2/)
	assert.match(fitted, /- detail-1/)
	assert.match(fitted, /- detail-2/)
})

test('fitHistorySummaryToBudget 在字符压缩阶段保留 IMPORTANT DETAILS 原文', () => {
	const longText = 'x'.repeat(120)
	const importantDetail = `Path: ${'y'.repeat(120)}`
	const fitted = fitHistorySummaryToBudget(
		buildStructuredSummary({
			context: [longText],
			decisions: [longText],
			currentState: [longText],
			importantDetails: [importantDetail],
			openItems: [longText],
		}),
		180,
		(value) => value.length,
	)

	assert.match(fitted, /- x{49}…/)
	assert.match(fitted, new RegExp(`- ${importantDetail}`))
})