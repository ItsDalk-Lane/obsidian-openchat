import assert from 'node:assert/strict'
import test from 'node:test'
import { FileIntentAnalyzer } from './service-file-intent'
import { ChatAttachmentSelectionService } from './service-attachment-selection'
import {
	buildLivePlanGuidance,
	buildLivePlanUserContext,
} from './service-plan-prompts'
import {
	extractToolCallsFromHistory,
	parseMcpToolBlocksFromHistory,
	parseReasoningBlocksFromHistory,
	parseSubAgentStatesFromHistory,
} from './service-history-parsing'
import { ChatStateStore } from './service-state-store'
import type { ChatMessage, ChatSession, ChatState } from './types'

const createChatState = (): ChatState => ({
	activeSession: null,
	isGenerating: false,
	inputValue: '',
	selectedModelId: null,
	selectedModels: [],
	enableReasoningToggle: false,
	enableWebSearchToggle: false,
	enableTemplateAsSystemPrompt: false,
	contextNotes: [],
	selectedImages: [],
	selectedFiles: [],
	selectedFolders: [],
	shouldSaveHistory: false,
	multiModelMode: 'single',
	layoutMode: 'horizontal',
})

const createChatSession = (): ChatSession => ({
	id: 'session-1',
	title: 'Chat',
	modelId: 'model-a',
	messages: [],
	createdAt: 1,
	updatedAt: 1,
})

test('buildLivePlanGuidance 与 buildLivePlanUserContext 反映当前 live plan', () => {
	const livePlan: ChatSession['livePlan'] = {
		title: '迁移 chat helper',
		description: '执行步骤 4',
		tasks: [
			{
				name: '迁移 parsing',
				status: 'done',
				acceptance_criteria: ['legacy shim 保持兼容'],
				outcome: '已完成',
			},
			{
				name: '迁移 state store',
				status: 'in_progress',
				acceptance_criteria: ['不改变 emit 语义'],
			},
		],
		summary: {
			total: 2,
			todo: 0,
			inProgress: 1,
			done: 1,
			skipped: 0,
		},
	}

	const guidance = buildLivePlanGuidance(livePlan)
	const context = buildLivePlanUserContext(livePlan)

	assert.equal(guidance?.includes('write_plan'), true)
	assert.equal(context?.includes('计划标题：迁移 chat helper'), true)
	assert.equal(context?.includes('当前优先任务：迁移 state store'), true)
	assert.equal(buildLivePlanGuidance(null), null)
})

test('FileIntentAnalyzer 区分待处理数据与示例参考', () => {
	const analyzer = new FileIntentAnalyzer()

	assert.deepEqual(
		analyzer.analyzePromptIntent('你是一位资深审稿人，请总结以下文件'),
		{
			role: 'processing_target',
			reasoning: '检测到角色定义类提示词，文件应作为待处理数据',
			confidence: 'high',
		},
	)
	assert.equal(
		analyzer.analyzePromptIntent('请分析以下文件并总结要点').role,
		'processing_target',
	)
	assert.equal(analyzer.analyzePromptIntent('参照以下模板输出').role, 'example')
	assert.equal(analyzer.getFileRoleDisplayName('example'), '示例')
})

test('history parsing helper 能恢复工具调用与 sub-agent 状态', () => {
	const toolHistory = [
		'原始正文',
		'> [!info]- **write_file** notes.md（4字）',
		'> ```text',
		'> body',
		'> ```',
		'> 结果: ok',
		'>',
	].join('\n')

	const extracted = extractToolCallsFromHistory(toolHistory)
	assert.equal(extracted.content, '原始正文')
	assert.equal(extracted.toolCalls?.[0]?.name, 'write_file')
	assert.deepEqual(extracted.toolCalls?.[0]?.arguments, {
		filePath: 'notes.md',
		content: 'body',
	})
	assert.equal(extracted.toolCalls?.[0]?.result, 'ok')

	const parsedReasoning = parseReasoningBlocksFromHistory(
		'> [!danger]- 深度思考 1.50s\n> 先分析\n> 再执行\n',
	)
	assert.equal(parsedReasoning.includes('{{FF_REASONING_START}}:'), true)
	assert.equal(parsedReasoning.includes('先分析\n再执行'), true)

	assert.equal(
		parseMcpToolBlocksFromHistory('> [!info]- fetch_url\n> https://example.com\n'),
		'{{FF_MCP_TOOL_START}}:fetch_url:https://example.com{{FF_MCP_TOOL_END}}:',
	)

	const createMessage = (
		role: ChatMessage['role'],
		text: string,
		extras?: Partial<ChatMessage>,
	): ChatMessage => ({
		id: extras?.id ?? `${role}-${text}`,
		role,
		content: text,
		timestamp: extras?.timestamp ?? 0,
		images: extras?.images ?? [],
		isError: extras?.isError ?? false,
		metadata: extras?.metadata ?? {},
		toolCalls: extras?.toolCalls ?? [],
	})

	const subAgentHistory = [
		'保留正文',
		'> [!quote]- 🤖 Planner (已完成, 1条消息)',
		'> ### AI (2026-03-28 08:00:00)',
		'> 已整理计划',
		'>',
	].join('\n')
	const subAgentResult = parseSubAgentStatesFromHistory(subAgentHistory, createMessage)
	const parsedState = Object.values(subAgentResult.subAgentStates)[0]

	assert.equal(subAgentResult.cleanedContent, '保留正文')
	assert.equal(parsedState.name, 'Planner')
	assert.equal(parsedState.status, 'completed')
	assert.equal(parsedState.internalMessages[0]?.role, 'assistant')
	assert.equal(parsedState.internalMessages[0]?.content, '已整理计划')
})

test('ChatStateStore 返回克隆快照并按预期 emit', () => {
	const store = new ChatStateStore(createChatState())
	const snapshots: ChatState[] = []

	const unsubscribe = store.subscribe((state) => {
		snapshots.push(state)
	})
	store.updateBatch((state) => {
		state.inputValue = 'next'
		state.shouldSaveHistory = true
	})

	const snapshot = store.getState()
	snapshot.inputValue = 'mutated'

	assert.equal(store.getMutableState().inputValue, 'next')
	assert.equal(store.getMutableState().shouldSaveHistory, true)
	assert.equal(snapshots.length, 2)
	assert.equal(snapshots[1]?.inputValue, 'next')

	unsubscribe()
	store.dispose()
})

test('ChatAttachmentSelectionService 维护选择快照并与 session 同步', () => {
	const store = new ChatStateStore(createChatState())
	const service = new ChatAttachmentSelectionService(store)

	service.updateSelectionWithFile({
		path: 'docs/spec.md',
		name: 'spec.md',
		extension: 'md',
	})
	service.updateSelectionWithFile({
		path: 'docs/spec.md',
		name: 'spec.md',
		extension: 'md',
	})
	service.updateSelectionWithFolder({
		path: 'docs',
		name: 'docs',
	})

	const mutatedSnapshot = service.getSelectionSnapshot()
	mutatedSnapshot.selectedFiles[0]!.name = 'changed.md'
	assert.equal(store.getMutableState().selectedFiles[0]?.name, 'spec.md')
	assert.equal(store.getMutableState().selectedFiles.length, 1)
	assert.equal(store.getMutableState().selectedFolders.length, 1)

	const cleanSnapshot = service.getSelectionSnapshot()
	service.updateSelectionToEmpty(false)
	assert.equal(store.getMutableState().selectedFiles.length, 0)
	service.updateSelectionSnapshot(cleanSnapshot, false)
	assert.equal(store.getMutableState().selectedFiles[0]?.path, 'docs/spec.md')

	const session = createChatSession()
	service.syncSelectionToSession(session)
	assert.deepEqual(session.selectedFiles, store.getMutableState().selectedFiles)
	assert.deepEqual(session.selectedFolders, store.getMutableState().selectedFolders)
	store.getMutableState().selectedFiles[0]!.name = 'state-mutated.md'
	assert.equal(session.selectedFiles?.[0]?.name, 'spec.md')

	const sessionSelection = {
		...createChatSession(),
		selectedFiles: [{
			id: 'vault/plan.md',
			name: 'plan.md',
			path: 'vault/plan.md',
			extension: 'md',
			type: 'file',
			isAutoAdded: true,
		}],
		selectedFolders: [{
			id: 'vault',
			name: 'vault',
			path: 'vault',
			type: 'folder',
		}],
	}
	service.updateSelectionFromSession({
		...sessionSelection,
	}, false)
	sessionSelection.selectedFiles[0]!.name = 'session-mutated.md'
	assert.equal(store.getMutableState().selectedFiles[0]?.path, 'vault/plan.md')
	assert.equal(store.getMutableState().selectedFiles[0]?.name, 'plan.md')
	assert.equal('isAutoAdded' in (store.getMutableState().selectedFiles[0] as Record<string, unknown>), false)
	assert.equal(store.getMutableState().selectedFolders[0]?.path, 'vault')
})

test('ChatAttachmentSelectionService 仅维护显式选择并对重复文件去重', () => {
	const store = new ChatStateStore(createChatState())
	const service = new ChatAttachmentSelectionService(store)

	service.updateSelectionWithFile({
		path: 'notes/active.md',
		name: 'active.md',
		extension: 'md',
	})
	service.updateSelectionWithFile({
		path: 'notes/active.md',
		name: 'active.md',
		extension: 'md',
	})
	service.updateSelectionWithFile({
		path: 'data/schema.json',
		name: 'schema.json',
		extension: 'json',
	})

	assert.deepEqual(
		store.getMutableState().selectedFiles.map((file) => file.path),
		['notes/active.md', 'data/schema.json'],
	)

	service.updateSelectionWithoutFile('notes/active.md')
	assert.deepEqual(
		store.getMutableState().selectedFiles.map((file) => file.path),
		['data/schema.json'],
	)
})
