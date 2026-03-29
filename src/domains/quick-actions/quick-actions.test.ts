import test from 'node:test'
import assert from 'node:assert/strict'
import type { QuickAction } from 'src/domains/chat/types'
import { QuickActionCompatibilityError } from './service-result'
import {
	getNestingLevelSync,
	getSubtreeMaxRelativeDepthSync,
	removeFromAllGroupsSync,
	reorderTopLevelQuickActionsSync,
} from './service-group-helpers'

function installTestWindow(): void {
	(globalThis as {
		window?: {
			localStorage: { getItem: (key: string) => string }
			screen: { width: number; height: number }
		}
	}).window = {
		localStorage: {
			getItem(): string {
				return 'zh'
			},
		},
		screen: {
			width: 1920,
			height: 1080,
		},
	}
}

function createQuickAction(
	overrides: Partial<QuickAction> & Pick<QuickAction, 'id' | 'name' | 'order'>,
): QuickAction {
	return {
		prompt: '',
		promptSource: 'custom',
		showInToolbar: true,
		createdAt: 1,
		updatedAt: 1,
		...overrides,
	}
}

test('quick-actions 分组 helper 会计算层级与子树深度', () => {
	const quickActions: QuickAction[] = [
		createQuickAction({
			id: 'group-root',
			name: 'Root',
			order: 0,
			actionType: 'group',
			isActionGroup: true,
			children: ['child-group'],
		}),
		createQuickAction({
			id: 'child-group',
			name: 'Child Group',
			order: 1,
			actionType: 'group',
			isActionGroup: true,
			children: ['leaf-action'],
		}),
		createQuickAction({
			id: 'leaf-action',
			name: 'Leaf',
			order: 2,
			actionType: 'normal',
		}),
	]

	assert.equal(getNestingLevelSync('group-root', quickActions), 0)
	assert.equal(getNestingLevelSync('child-group', quickActions), 1)
	assert.equal(getNestingLevelSync('leaf-action', quickActions), 2)
	assert.equal(getSubtreeMaxRelativeDepthSync('group-root', quickActions), 2)
	assert.equal(getSubtreeMaxRelativeDepthSync('child-group', quickActions), 1)
})

test('quick-actions 分组 helper 会从所有分组中移除目标并重排顶层顺序', async () => {
	const quickActions: QuickAction[] = [
		createQuickAction({
			id: 'alpha',
			name: 'Alpha',
			order: 0,
		}),
		createQuickAction({
			id: 'group-root',
			name: 'Root',
			order: 1,
			actionType: 'group',
			isActionGroup: true,
			children: ['beta'],
		}),
		createQuickAction({
			id: 'beta',
			name: 'Beta',
			order: 2,
		}),
		createQuickAction({
			id: 'gamma',
			name: 'Gamma',
			order: 3,
		}),
	]

	removeFromAllGroupsSync('beta', quickActions)
	assert.deepEqual(
		quickActions.find((item) => item.id === 'group-root')?.children ?? [],
		[],
	)

	await reorderTopLevelQuickActionsSync(quickActions, 'gamma', 0)
	const topLevel = quickActions
		.filter((item) => item.id !== 'beta')
		.sort((left, right) => left.order - right.order)
		.map((item) => item.id)
	assert.deepEqual(topLevel, ['gamma', 'alpha', 'group-root'])
})

test('QuickActionDataService moveQuickActionToGroupResult 会对非法分组返回 typed Result', async () => {
	installTestWindow()
	const { QuickActionDataService } = await import('./service-data')
	const service = new QuickActionDataService(
		{
			ensureAiDataFolders: async () => {},
			normalizePath: (value: string) => value,
			listFolderEntries: () => [],
			readVaultFile: async () => '',
			parseYaml: () => ({}),
			stringifyYaml: () => '',
			getVaultEntry: () => null,
			writeVaultFile: async () => {},
			deleteVaultPath: async () => {},
		} as never,
		{
			getAiDataFolder: () => 'System/AI Data',
			syncRuntimeQuickActions: () => {},
		},
	)
	;(service as QuickActionDataService & { quickActionsCache: QuickAction[] }).quickActionsCache = [
		createQuickAction({ id: 'leaf', name: 'Leaf', order: 0, actionType: 'normal' }),
	]

	const result = await service.moveQuickActionToGroupResult('leaf', 'missing-group')
	assert.equal(result.ok, false)
	if (result.ok) {
		assert.fail('期望返回错误结果')
	}
	assert.equal(result.error.kind, 'invalid-group-target')
	assert.equal(result.error.message, '目标不是有效的操作组')
})

test('QuickActionDataService 旧接口仍会抛出兼容异常', async () => {
	installTestWindow()
	const { QuickActionDataService } = await import('./service-data')
	const service = new QuickActionDataService(
		{
			ensureAiDataFolders: async () => {},
			normalizePath: (value: string) => value,
			listFolderEntries: () => [],
			readVaultFile: async () => '',
			parseYaml: () => ({}),
			stringifyYaml: () => '',
			getVaultEntry: () => null,
			writeVaultFile: async () => {},
			deleteVaultPath: async () => {},
		} as never,
		{
			getAiDataFolder: () => 'System/AI Data',
			syncRuntimeQuickActions: () => {},
		},
	)
	;(service as QuickActionDataService & { quickActionsCache: QuickAction[] }).quickActionsCache = [
		createQuickAction({ id: 'leaf', name: 'Leaf', order: 0, actionType: 'normal' }),
	]

	await assert.rejects(
		() => service.moveQuickActionToGroup('leaf', 'missing-group'),
		(error: unknown) =>
			error instanceof QuickActionCompatibilityError
			&& error.kind === 'invalid-group-target'
			&& error.message === '目标不是有效的操作组',
	)
})

test('QuickActionDataService updateQuickActionGroupChildrenResult 会检测循环引用', async () => {
	installTestWindow()
	const { QuickActionDataService } = await import('./service-data')
	const service = new QuickActionDataService(
		{
			ensureAiDataFolders: async () => {},
			normalizePath: (value: string) => value,
			listFolderEntries: () => [],
			readVaultFile: async () => '',
			parseYaml: () => ({}),
			stringifyYaml: () => '',
			getVaultEntry: () => null,
			writeVaultFile: async () => {},
			deleteVaultPath: async () => {},
		} as never,
		{
			getAiDataFolder: () => 'System/AI Data',
			syncRuntimeQuickActions: () => {},
		},
	)
	;(service as QuickActionDataService & { quickActionsCache: QuickAction[] }).quickActionsCache = [
		createQuickAction({
			id: 'group-a',
			name: 'Group A',
			order: 0,
			actionType: 'group',
			isActionGroup: true,
			children: ['group-b'],
		}),
		createQuickAction({
			id: 'group-b',
			name: 'Group B',
			order: 1,
			actionType: 'group',
			isActionGroup: true,
			children: [],
		}),
	]

	const result = await service.updateQuickActionGroupChildrenResult('group-b', ['group-a'])
	assert.equal(result.ok, false)
	if (result.ok) {
		assert.fail('期望返回错误结果')
	}
	assert.equal(result.error.kind, 'cycle-detected')
	assert.equal(result.error.message, '操作组 children 存在循环引用')
})

test('QuickActionExecutionService executeQuickAction 会对缺少模型配置返回结构化失败结果', async () => {
	installTestWindow()
	const { QuickActionExecutionService } = await import('./service-execution')
	const service = new QuickActionExecutionService(
		{
			readVaultFile: async () => '',
			buildGlobalSystemPrompt: async () => '',
		} as never,
		{
			createSendRequest: () => null,
		},
		() => ({ providers: [] }),
		() => 'Templates',
	)

	const result = await service.executeQuickAction(
		createQuickAction({ id: 'leaf', name: 'Leaf', order: 0, actionType: 'normal' }),
		'selected text',
	)
	assert.deepEqual(result, {
		success: false,
		content: '',
		error: '未找到可用的 AI 模型配置',
	})
})

test('QuickActionExecutionService executeQuickActionStreamResult 会为 Result-first consumer 返回 typed 错误', async () => {
	installTestWindow()
	const { QuickActionExecutionService } = await import('./service-execution')
	const service = new QuickActionExecutionService(
		{
			readVaultFile: async () => '',
			buildGlobalSystemPrompt: async () => '',
		} as never,
		{
			createSendRequest: () => null,
		},
		() => ({
			providers: [{
				tag: 'gpt-4.1',
				vendor: 'MissingVendor',
				options: {},
			}],
		}),
		() => 'Templates',
	)

	const result = await service.executeQuickActionStreamResult(
		createQuickAction({
			id: 'leaf',
			name: 'Leaf',
			order: 0,
			actionType: 'normal',
			modelTag: 'gpt-4.1',
		}),
		'selected text',
	)

	assert.equal(result.ok, false)
	if (result.ok) {
		assert.fail('期望返回错误结果')
	}
	assert.equal(result.error.kind, 'provider-missing')
	assert.equal(result.error.message, '未找到 AI 提供商: MissingVendor')
})

test('QuickActionExecutionService executeQuickActionStream 会通过兼容异常保留旧抛错语义', async () => {
	installTestWindow()
	const { QuickActionExecutionService } = await import('./service-execution')
	const service = new QuickActionExecutionService(
		{
			readVaultFile: async () => '',
			buildGlobalSystemPrompt: async () => '',
		} as never,
		{
			createSendRequest: () => null,
		},
		() => ({
			providers: [{
				tag: 'gpt-4.1',
				vendor: 'MissingVendor',
				options: {},
			}],
		}),
		() => 'Templates',
	)

	const stream = service.executeQuickActionStream(
		createQuickAction({
			id: 'leaf',
			name: 'Leaf',
			order: 0,
			actionType: 'normal',
			modelTag: 'gpt-4.1',
		}),
		'selected text',
	)

	await assert.rejects(
		async () => {
			for await (const _chunk of stream) {
				assert.fail('不应进入流式输出')
			}
		},
		(error: unknown) =>
			error instanceof QuickActionCompatibilityError
			&& error.kind === 'provider-missing'
			&& error.message === '未找到 AI 提供商: MissingVendor',
	)
})
