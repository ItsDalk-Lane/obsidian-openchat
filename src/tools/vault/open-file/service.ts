import type { App } from 'obsidian';
import { getFileOrThrow } from '../_shared/helpers';
import { assertVaultPath, normalizeVaultPath } from '../_shared/path';

export interface OpenFileArgs extends Record<string, unknown> {
	file_path: string;
	open_in_new_panel?: boolean;
}

export const executeOpenFile = async (
	app: App,
	{ file_path, open_in_new_panel = false }: OpenFileArgs,
): Promise<{
	file_path: string;
	open_in_new_panel: boolean;
	opened: true;
}> => {
	const normalizedPath = normalizeVaultPath(file_path);
	assertVaultPath(normalizedPath, 'file_path');
	const file = getFileOrThrow(app, normalizedPath);
	const leaf = app.workspace.getLeaf(open_in_new_panel);
	await leaf.openFile(file);
	return {
		file_path: normalizedPath,
		open_in_new_panel,
		opened: true,
	};
};
