import type { QuickAction } from './types';

export function getNestingLevelSync(
	quickActionId: string,
	quickActions: QuickAction[],
): number {
	let level = 0;
	let currentId: string | null = quickActionId;
	const seen = new Set<string>();
	while (currentId) {
		if (seen.has(currentId)) {
			break;
		}
		seen.add(currentId);
		const parent = findParentGroupSync(currentId, quickActions);
		if (!parent) {
			break;
		}
		level += 1;
		currentId = parent.id;
	}
	return level;
}

export function findParentGroupSync(
	quickActionId: string,
	quickActions: QuickAction[],
): QuickAction | null {
	for (const quickAction of quickActions) {
		if (quickAction.isActionGroup && (quickAction.children ?? []).includes(quickActionId)) {
			return quickAction;
		}
	}
	return null;
}

export function removeFromAllGroupsSync(
	quickActionId: string,
	quickActions: QuickAction[],
): void {
	for (const quickAction of quickActions) {
		if (!quickAction.isActionGroup) {
			continue;
		}
		const before = quickAction.children ?? [];
		const after = before.filter((id) => id !== quickActionId);
		if (after.length !== before.length) {
			quickAction.children = after;
			quickAction.updatedAt = Date.now();
		}
	}
}

export function getSubtreeMaxRelativeDepthSync(
	quickActionId: string,
	quickActions: QuickAction[],
): number {
	const byId = new Map(quickActions.map((quickAction) => [quickAction.id, quickAction] as const));
	const seen = new Set<string>();

	const dfs = (currentId: string): number => {
		if (seen.has(currentId)) {
			return 0;
		}
		seen.add(currentId);
		const current = byId.get(currentId);
		if (!current || !current.isActionGroup) {
			return 0;
		}
		let maxChild = 0;
		for (const childId of current.children ?? []) {
			maxChild = Math.max(maxChild, 1 + dfs(childId));
		}
		return maxChild;
	};

	return dfs(quickActionId);
}

export async function reorderTopLevelQuickActionsSync(
	quickActions: QuickAction[],
	movingQuickActionId?: string,
	position?: number,
): Promise<void> {
	const referenced = new Set<string>();
	for (const quickAction of quickActions) {
		if (!quickAction.isActionGroup) {
			continue;
		}
		for (const id of quickAction.children ?? []) {
			referenced.add(id);
		}
	}

	const topLevel = quickActions
		.filter((quickAction) => !referenced.has(quickAction.id))
		.sort((a, b) => a.order - b.order);

	if (movingQuickActionId) {
		const movingIndex = topLevel.findIndex(
			(quickAction) => quickAction.id === movingQuickActionId,
		);
		if (movingIndex >= 0) {
			const [moving] = topLevel.splice(movingIndex, 1);
			const insertAt = position === undefined
				? topLevel.length
				: Math.max(0, Math.min(position, topLevel.length));
			topLevel.splice(insertAt, 0, moving);
		}
	}

	topLevel.forEach((quickAction, index) => {
		quickAction.order = index;
		quickAction.updatedAt = Date.now();
	});
}
