import test from 'node:test'
import assert from 'node:assert/strict'
import type { QuickAction } from 'src/types/chat'
import {
	getNestingLevelSync,
	getSubtreeMaxRelativeDepthSync,
	removeFromAllGroupsSync,
	reorderTopLevelQuickActionsSync,
} from './service-group-helpers'

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
