import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_CHAT_SETTINGS } from './config'
import { MessageContextOptimizer } from './service-context-compaction'
import {
	buildRequestTokenState,
	getChatDefaultFileContentOptions,
	getChatMessageManagementSettings,
	hasContextCompactionChanged,
	normalizeContextCompactionState,
} from './service-provider-message-support'
import type { ChatMessage } from './types'

const createMessage = (
	role: ChatMessage['role'],
	content: string,
	extras?: Partial<ChatMessage>,
): ChatMessage => ({
	id: extras?.id ?? `${role}-${content}`,
	role,
	content,
	timestamp: extras?.timestamp ?? Date.now(),
	images: extras?.images ?? [],
	isError: extras?.isError ?? false,
	metadata: extras?.metadata ?? {},
	toolCalls: extras?.toolCalls ?? [],
})

test('MessageContextOptimizer 在重复 optimize 时复用已有 compaction 摘要', async () => {
	const optimizer = new MessageContextOptimizer()
	const messages = [
		createMessage('user', '早期请求 ' + 'x'.repeat(400), { timestamp: 1 }),
		createMessage('assistant', '早期响应 ' + 'y'.repeat(400), { timestamp: 2 }),
		createMessage('user', '最新请求', { timestamp: 3 }),
	]
	const settings = { ...DEFAULT_CHAT_SETTINGS.messageManagement, recentTurns: 1 }

	const initial = await optimizer.optimize(messages, settings, null, {
		targetHistoryBudgetTokens: 80,
	})
	let generatorCalled = false
	const reused = await optimizer.optimize(messages, settings, initial.contextCompaction, {
		targetHistoryBudgetTokens: 80,
		summaryGenerator: async () => {
			generatorCalled = true
			return 'should not be used'
		},
	})

	assert.equal(initial.usedSummary, true)
	assert.equal(generatorCalled, false)
	assert.equal(
		reused.contextCompaction?.summary,
		initial.contextCompaction?.summary,
	)
})

test('MessageContextOptimizer 在满足增量条件时向 generator 提供 delta summary', async () => {
	const optimizer = new MessageContextOptimizer()
	const baseMessages = [
		createMessage('user', '旧请求一 ' + 'x'.repeat(300), { timestamp: 1 }),
		createMessage('assistant', '旧响应一 ' + 'y'.repeat(300), { timestamp: 2 }),
		createMessage('user', '最新请求', { timestamp: 5 }),
	]
	const extendedMessages = [
		createMessage('user', '旧请求一 ' + 'x'.repeat(300), { timestamp: 1 }),
		createMessage('assistant', '旧响应一 ' + 'y'.repeat(300), { timestamp: 2 }),
		createMessage('user', '旧请求二 ' + 'm'.repeat(300), { timestamp: 3 }),
		createMessage('assistant', '旧响应二 ' + 'n'.repeat(300), { timestamp: 4 }),
		createMessage('user', '最新请求', { timestamp: 5 }),
	]
	const settings = { ...DEFAULT_CHAT_SETTINGS.messageManagement, recentTurns: 1 }
	const existing = await optimizer.optimize(baseMessages, settings, null, {
		targetHistoryBudgetTokens: 80,
	})
	let requestSnapshot: Parameters<NonNullable<Parameters<typeof optimizer.optimize>[3]>['summaryGenerator']>[0] | null = null

	await optimizer.optimize(extendedMessages, settings, existing.contextCompaction, {
		targetHistoryBudgetTokens: 80,
		summaryGenerator: async (request) => {
			requestSnapshot = request
			return request.baseSummary
		},
	})

	assert.equal(requestSnapshot?.incremental, true)
	assert.match(requestSnapshot?.deltaSummary ?? '', /旧请求二|旧响应二/)
	assert.match(requestSnapshot?.previousSummary ?? '', /Earlier conversation summary/)
})

test('MessageContextOptimizer 在受保护层超预算时标记 overflowedProtectedLayers 并保留 sticky tail', async () => {
	const optimizer = new MessageContextOptimizer()
	const messages = [
		createMessage('user', '被置顶的旧请求 ' + 'x'.repeat(400), {
			timestamp: 1,
			metadata: { pinned: true },
		}),
		createMessage('assistant', '旧响应 ' + 'y'.repeat(400), { timestamp: 2 }),
		createMessage('user', '最近请求 ' + 'z'.repeat(400), { timestamp: 3 }),
		createMessage('user', '临时上下文', {
			timestamp: 4,
			metadata: { isEphemeralContext: true },
		}),
	]

	const result = await optimizer.optimize(
		messages,
		{ ...DEFAULT_CHAT_SETTINGS.messageManagement, recentTurns: 1 },
		null,
		{ targetHistoryBudgetTokens: 40 },
	)

	assert.equal(result.contextCompaction?.overflowedProtectedLayers, true)
	assert.equal(result.contextCompaction?.coveredRange.messageCount, 0)
	assert.equal(result.usedSummary, false)
	assert.equal(result.messages[result.messages.length - 1]?.content, '临时上下文')
	assert.equal(result.messages[result.messages.length - 1]?.metadata?.isEphemeralContext, true)
})

test('provider message support helper 返回稳定默认值并构建 token state', () => {
	assert.deepEqual(
		getChatMessageManagementSettings(
			{ ...DEFAULT_CHAT_SETTINGS, messageManagement: { ...DEFAULT_CHAT_SETTINGS.messageManagement, recentTurns: 2 } },
			{ ...DEFAULT_CHAT_SETTINGS, messageManagement: { ...DEFAULT_CHAT_SETTINGS.messageManagement, recentTurns: 4, summaryModelTag: 'claude' } },
		),
		{
			enabled: true,
			recentTurns: 4,
			summaryModelTag: 'claude',
		},
	)
	assert.equal(getChatDefaultFileContentOptions().maxFileSize, 1024 * 1024)
	assert.equal(
		buildRequestTokenState({
			totalTokenEstimate: 100,
			messageTokenEstimate: 80,
			toolTokenEstimate: 20,
			userTurnTokenEstimate: 16,
		}).userTurnTokenEstimate,
		16,
	)
})

test('provider message support helper 比较并归一化 compaction 状态', () => {
	const current = {
		version: 3,
		coveredRange: { endMessageId: 'a', messageCount: 1, signature: '1' },
		summary: 'summary',
		historyTokenEstimate: 10,
		contextSummary: 'context',
		contextSourceSignature: 'sig',
		contextTokenEstimate: 20,
		totalTokenEstimate: 30,
		updatedAt: 1,
		droppedReasoningCount: 0,
	} satisfies ChatSession['contextCompaction']

	assert.equal(hasContextCompactionChanged(current, current), false)
	assert.deepEqual(normalizeContextCompactionState(current, false), {
		...current,
		contextSummary: undefined,
		contextSourceSignature: undefined,
		contextTokenEstimate: undefined,
	})
	assert.equal(
		normalizeContextCompactionState({
			version: 3,
			coveredRange: { endMessageId: null, messageCount: 0, signature: '0' },
			summary: '',
			historyTokenEstimate: 0,
			updatedAt: 1,
			droppedReasoningCount: 0,
		}, true),
		null,
	)
})