/**
 * @module quick-actions/service-data-support
 * @description 提供 quick-actions 数据层使用的路径与错误构造辅助函数。
 *
 * @dependencies src/i18n/locals, src/providers/providers.types,
 *   src/domains/quick-actions/types, src/domains/quick-actions/config
 * @side-effects 无
 * @invariants 仅承载纯辅助逻辑，不访问宿主状态。
 */

import { localInstance } from 'src/i18n/locals';
import type { VaultEntry, VaultPathPort } from 'src/providers/providers.types';
import { QUICK_ACTIONS_SUBFOLDER } from './config';
import type { QuickActionDataError } from './types';

export function getQuickActionIdFromPath(filePath: string): string {
	return filePath.split('/').pop()?.replace(/\.md$/u, '') ?? filePath;
}

export function getQuickActionsPath(
	obsidianApi: VaultPathPort,
	aiDataFolder: string,
): string {
	return obsidianApi.normalizePath(
		`${aiDataFolder.replace(/[\\/]+$/gu, '')}/${QUICK_ACTIONS_SUBFOLDER}`,
	);
}

export function isMarkdownEntry(entry: VaultEntry): boolean {
	return entry.kind === 'file' && entry.path.endsWith('.md');
}

export function createInvalidGroupTargetError(
	targetGroupId: string,
): QuickActionDataError {
	return {
		source: 'data',
		kind: 'invalid-group-target',
		targetGroupId,
		message: localInstance.quick_action_invalid_group_target,
	};
}

export function createSelfTargetError(
	quickActionId: string,
): QuickActionDataError {
	return {
		source: 'data',
		kind: 'self-target',
		quickActionId,
		message: localInstance.quick_action_group_self_target,
	};
}

export function createDescendantTargetError(
	quickActionId: string,
	targetGroupId: string,
): QuickActionDataError {
	return {
		source: 'data',
		kind: 'descendant-target',
		quickActionId,
		targetGroupId,
		message: localInstance.quick_action_group_descendant_target,
	};
}

export function createMaxDepthExceededError(
	quickActionId: string,
	targetGroupId: string | null,
): QuickActionDataError {
	return {
		source: 'data',
		kind: 'max-depth-exceeded',
		quickActionId,
		targetGroupId,
		message: localInstance.quick_action_group_max_depth,
	};
}

export function createCycleDetectedError(
	groupId: string,
	childId: string,
): QuickActionDataError {
	return {
		source: 'data',
		kind: 'cycle-detected',
		groupId,
		childId,
		message: localInstance.quick_action_group_cycle_detected,
	};
}

export function createStorageFolderMissingError(
	aiDataFolder: string,
): QuickActionDataError {
	return {
		source: 'data',
		kind: 'storage-folder-missing',
		aiDataFolder,
		message: localInstance.quick_action_storage_folder_missing,
	};
}
