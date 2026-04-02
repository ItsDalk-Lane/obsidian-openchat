import type { App } from 'obsidian';
import {
	isLikelyDestructiveTextReplacement,
	normalizeAndValidatePath,
} from 'src/core/services/fileOperationHelpers';
import type {
	BuiltinPermissionDecision,
	BuiltinValidationResult,
} from '../../runtime/types';
import { getFileOrThrow } from '../_shared/helpers';
import { normalizeFilePath } from '../_shared/path';
import { applyEditsToText, type EditOperation } from '../_shared/result';
import type { EditFileArgs } from './schema';

const normalizeEditFilePath = (filePath: string): string => {
	normalizeAndValidatePath(filePath);
	return normalizeFilePath(filePath, 'file_path');
};

export const isDestructiveEditOperation = (edit: EditOperation): boolean => (
	isLikelyDestructiveTextReplacement(edit.oldText, edit.newText)
);

export const validateEditFileInput = (
	args: EditFileArgs,
): BuiltinValidationResult => {
	try {
		normalizeEditFilePath(args.file_path);
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
			notes: ['edit_file 只接受明确文件路径；不知道路径时请先使用 find_paths。'],
		};
	}

	const emptyAnchorIndex = args.edits.findIndex((edit) => edit.oldText.length === 0);
	if (emptyAnchorIndex >= 0) {
		return {
			ok: false,
			summary: `edits[${emptyAnchorIndex}].oldText 不能为空`,
			notes: ['oldText 应使用能唯一定位的最小连续文本锚点。'],
		};
	}

	return { ok: true };
};

export const checkEditFilePermissions = async (
	app: App,
	args: EditFileArgs,
): Promise<BuiltinPermissionDecision<EditFileArgs>> => {
	const normalizedPath = normalizeEditFilePath(args.file_path);
	const updatedArgs: EditFileArgs = {
		...args,
		file_path: normalizedPath,
	};

	if (args.dry_run) {
		return { behavior: 'allow', updatedArgs };
	}

	getFileOrThrow(app, normalizedPath);
	const destructive = args.edits.some(isDestructiveEditOperation);
	const needsConfirmation = destructive || args.edits.length > 1;

	if (!needsConfirmation) {
		return { behavior: 'allow', updatedArgs };
	}

	return {
		behavior: 'ask',
		message: destructive
			? `将对 ${normalizedPath} 应用高风险局部编辑`
			: `将对 ${normalizedPath} 应用多处局部编辑`,
		updatedArgs,
		...(destructive ? { escalatedRisk: 'destructive' as const } : {}),
		confirmation: {
			title: destructive ? '确认高风险编辑' : '确认应用编辑',
			body: `${normalizedPath}（${args.edits.length} 处修改）`,
			confirmLabel: destructive ? '确认修改' : '继续修改',
		},
	};
};

export const executeEditFile = async (
	app: App,
	args: EditFileArgs,
): Promise<{
	file_path: string;
	dry_run: boolean;
	applied_edits: number;
	updated: boolean;
	diff: string;
}> => {
	const normalizedPath = normalizeEditFilePath(args.file_path);
	const file = getFileOrThrow(app, normalizedPath);
	const originalText = await app.vault.cachedRead(file);
	const { diff, modifiedText } = applyEditsToText(
		originalText,
		args.edits,
		normalizedPath,
		args.dry_run ?? false,
	);

	if (!args.dry_run) {
		await app.vault.modify(file, modifiedText);
	}

	return {
		file_path: normalizedPath,
		dry_run: args.dry_run ?? false,
		applied_edits: args.edits.length,
		updated: !(args.dry_run ?? false),
		diff,
	};
};
