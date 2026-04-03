import type { App } from 'obsidian';
import { ensureFolderExists } from '../_shared/helpers';
import { normalizeDirectoryPath } from '../_shared/path';
import type { CreateDirectoryArgs } from './schema';

export const executeCreateDirectory = async (
	app: App,
	args: CreateDirectoryArgs,
): Promise<{
	directory_path: string;
	created: boolean;
	existed: boolean;
}> => {
	const normalizedPath = normalizeDirectoryPath(args.directory_path, 'directory_path');
	const existed = !!app.vault.getAbstractFileByPath(normalizedPath);
	await ensureFolderExists(app, normalizedPath);
	return {
		directory_path: normalizedPath || '/',
		created: !existed,
		existed,
	};
};