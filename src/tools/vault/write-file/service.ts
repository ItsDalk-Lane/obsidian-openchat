import { TFile, type App } from 'obsidian';
import {
	isLikelyDestructiveTextReplacement,
	normalizeAndValidatePath,
} from 'src/core/services/fileOperationHelpers';
import type {
	BuiltinPermissionDecision,
	BuiltinValidationResult,
} from '../../runtime/types';
import { ensureParentFolderExists } from '../_shared/helpers';
import { normalizeFilePath } from '../_shared/path';
import type { WriteFileArgs } from './schema';

const normalizeWriteFilePath = (filePath: string): string => {
	normalizeAndValidatePath(filePath);
	return normalizeFilePath(filePath, 'file_path');
};

export const validateWriteFileInput = (
	args: WriteFileArgs,
): BuiltinValidationResult => {
	try {
		normalizeWriteFilePath(args.file_path);
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
			notes: ['write_file 只接受明确文件路径；不知道路径时请先使用 find_paths。'],
		};
	}
};

export const checkWriteFilePermissions = async (
	app: App,
	args: WriteFileArgs,
): Promise<BuiltinPermissionDecision<WriteFileArgs>> => {
	const normalizedPath = normalizeWriteFilePath(args.file_path);
	const updatedArgs: WriteFileArgs = {
		...args,
		file_path: normalizedPath,
	};
	const existing = app.vault.getAbstractFileByPath(normalizedPath);

	if (!existing) {
		return { behavior: 'allow', updatedArgs };
	}

	if (!(existing instanceof TFile)) {
		return {
			behavior: 'deny',
			message: `目标不是文件: ${normalizedPath}`,
		};
	}

	const currentContent = await app.vault.cachedRead(existing);
	if (currentContent === args.content) {
		return {
			behavior: 'allow',
			updatedArgs,
			notes: ['目标文件内容与写入内容相同，无需额外确认。'],
		};
	}

	const destructive = isLikelyDestructiveTextReplacement(
		currentContent,
		args.content,
	);

	return {
		behavior: 'ask',
		message: destructive
			? `将高风险覆盖已有文件 ${normalizedPath}`
			: `将覆盖已有文件 ${normalizedPath}`,
		updatedArgs,
		...(destructive ? { escalatedRisk: 'destructive' as const } : {}),
		confirmation: {
			title: destructive ? '确认高风险覆盖文件' : '确认覆盖文件',
			body: normalizedPath,
			confirmLabel: destructive ? '确认覆盖' : '继续覆盖',
		},
	};
};

export const executeWriteFile = async (
	app: App,
	args: WriteFileArgs,
): Promise<{
	file_path: string;
	action: 'updated' | 'created';
	bytes_written: number;
}> => {
	const normalizedPath = normalizeWriteFilePath(args.file_path);
	await ensureParentFolderExists(app, normalizedPath);
	const existing = app.vault.getAbstractFileByPath(normalizedPath);
	const existed = !!existing;

	if (!existing) {
		await app.vault.create(normalizedPath, args.content);
	} else if (existing instanceof TFile) {
		await app.vault.modify(existing, args.content);
	} else {
		throw new Error(`目标不是文件: ${normalizedPath}`);
	}

	return {
		file_path: normalizedPath,
		action: existed ? 'updated' : 'created',
		bytes_written: args.content.length,
	};
};
