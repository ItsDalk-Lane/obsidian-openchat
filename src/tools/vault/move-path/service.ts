import type { App } from 'obsidian';
import type {
	BuiltinPermissionDecision,
	BuiltinValidationResult,
} from '../../runtime/types';
import {
	ensureFolderExists,
	getAbstractFileOrThrow,
	normalizeVaultPath,
	assertVaultPath,
} from '../_shared/helpers';
import type { MovePathArgs } from './schema';

const normalizeMoveTargetPath = (
	input: string,
	fieldName: 'source_path' | 'destination_path',
): string => {
	const normalizedPath = normalizeVaultPath(input);
	assertVaultPath(normalizedPath, fieldName);
	return normalizedPath;
};

const isNestedUnderSource = (sourcePath: string, destinationPath: string): boolean => {
	return destinationPath.startsWith(`${sourcePath}/`);
};

const buildMoveSummary = (sourcePath: string, destinationPath: string): string => {
	return `${sourcePath} -> ${destinationPath}`;
};

export const validateMovePathInput = (
	args: MovePathArgs,
): BuiltinValidationResult => {
	try {
		const normalizedSource = normalizeMoveTargetPath(args.source_path, 'source_path');
		const normalizedDestination = normalizeMoveTargetPath(
			args.destination_path,
			'destination_path',
		);

		if (normalizedSource === normalizedDestination) {
			return {
				ok: false,
				summary: 'source_path 与 destination_path 不能相同',
			};
		}

		if (isNestedUnderSource(normalizedSource, normalizedDestination)) {
			return {
				ok: false,
				summary: '不能把目录移动到自己的子路径下',
			};
		}

		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
			notes: ['move_path 只接受明确源路径和目标路径；不知道路径时请先使用 find_paths。'],
		};
	}
};

export const checkMovePathPermissions = (
	app: App,
	args: MovePathArgs,
): BuiltinPermissionDecision<MovePathArgs> => {
	const normalizedSource = normalizeMoveTargetPath(args.source_path, 'source_path');
	const normalizedDestination = normalizeMoveTargetPath(
		args.destination_path,
		'destination_path',
	);
	const updatedArgs: MovePathArgs = {
		...args,
		source_path: normalizedSource,
		destination_path: normalizedDestination,
	};

	if (!app.vault.getAbstractFileByPath(normalizedSource)) {
		return {
			behavior: 'allow',
			updatedArgs,
			notes: ['源路径不存在时会沿用旧行为，在执行阶段返回错误。'],
		};
	}

	return {
		behavior: 'ask',
		message: `将移动或重命名路径 ${buildMoveSummary(
			normalizedSource,
			normalizedDestination,
		)}`,
		updatedArgs,
		confirmation: {
			title: '确认移动或重命名路径',
			body: buildMoveSummary(normalizedSource, normalizedDestination),
			confirmLabel: '继续移动',
		},
	};
};

export const executeMovePath = async (
	app: App,
	args: MovePathArgs,
): Promise<{
	source_path: string;
	destination_path: string;
	moved: true;
}> => {
	const normalizedSource = normalizeMoveTargetPath(args.source_path, 'source_path');
	const normalizedDestination = normalizeMoveTargetPath(
		args.destination_path,
		'destination_path',
	);
	const from = getAbstractFileOrThrow(app, normalizedSource);

	if (app.vault.getAbstractFileByPath(normalizedDestination)) {
		throw new Error(`目标路径已存在: ${normalizedDestination}`);
	}

	const destinationParent = normalizedDestination.includes('/')
		? normalizedDestination.slice(0, normalizedDestination.lastIndexOf('/'))
		: '';
	await ensureFolderExists(app, destinationParent);
	await app.vault.rename(from, normalizedDestination);

	return {
		source_path: normalizedSource,
		destination_path: normalizedDestination,
		moved: true,
	};
};

export const summarizeMovePathTarget = (
	args: Partial<MovePathArgs>,
): string | null => {
	if (!args.source_path || !args.destination_path) {
		return null;
	}
	return buildMoveSummary(args.source_path, args.destination_path);
};
