import { TFile, TFolder, type App } from 'obsidian';
import { localInstance } from 'src/i18n/locals';
import type {
	BuiltinPermissionDecision,
	BuiltinValidationResult,
} from '../../runtime/types';
import {
	assertVaultPath,
	normalizeVaultPath,
} from '../_shared/helpers';
import { collectDescendants } from '../filesystemFileOps';
import type { DeletePathArgs } from './schema';

const normalizeDeleteTargetPath = (targetPath: string): string => {
	const normalizedPath = normalizeVaultPath(targetPath);
	if (!normalizedPath) {
		throw new Error(localInstance.mcp_fs_delete_root_forbidden);
	}
	assertVaultPath(normalizedPath, 'target_path');
	return normalizedPath;
};

const buildDeleteConfirmationBody = (
	app: App,
	targetPath: string,
): string => {
	const target = app.vault.getAbstractFileByPath(targetPath);
	if (!target) {
		return targetPath;
	}
	if (target instanceof TFolder) {
		const descendants = collectDescendants(target).length;
		return `${targetPath}（目录，包含 ${descendants} 个子项）`;
	}
	if (target instanceof TFile) {
		return `${targetPath}（文件）`;
	}
	return targetPath;
};

export const validateDeletePathInput = (
	args: DeletePathArgs,
): BuiltinValidationResult => {
	try {
		normalizeDeleteTargetPath(args.target_path);
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
			notes: ['delete_path 只接受明确路径，且不允许删除 Vault 根目录。'],
		};
	}
};

export const checkDeletePathPermissions = (
	app: App,
	args: DeletePathArgs,
): BuiltinPermissionDecision<DeletePathArgs> => {
	const normalizedPath = normalizeDeleteTargetPath(args.target_path);
	const updatedArgs: DeletePathArgs = {
		...args,
		target_path: normalizedPath,
	};

	if (!app.vault.getAbstractFileByPath(normalizedPath)) {
		return {
			behavior: 'allow',
			updatedArgs,
			notes: ['目标路径不存在时会保留旧行为，返回 existed=false 的空操作结果。'],
		};
	}

	return {
		behavior: 'ask',
		message: `将永久删除路径 ${normalizedPath}`,
		updatedArgs,
		escalatedRisk: 'destructive',
		confirmation: {
			title: '确认永久删除路径',
			body: buildDeleteConfirmationBody(app, normalizedPath),
			confirmLabel: '确认删除',
		},
	};
};

export const executeDeletePath = async (
	app: App,
	args: DeletePathArgs,
): Promise<{
	target_path: string;
	existed: boolean;
	deleted: boolean;
}> => {
	const normalizedPath = normalizeDeleteTargetPath(args.target_path);
	const target = app.vault.getAbstractFileByPath(normalizedPath);

	if (!target) {
		return {
			target_path: normalizedPath,
			existed: false,
			deleted: false,
		};
	}

	await app.vault.delete(target, args.force ?? true);
	return {
		target_path: normalizedPath,
		existed: true,
		deleted: true,
	};
};

export const summarizeDeletePathTarget = (
	args: Partial<DeletePathArgs>,
): string | null => args.target_path ?? null;
