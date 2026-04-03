import { TFile, TFolder, type App } from 'obsidian';
import { getAbstractFileOrThrow, getFileStat } from '../_shared/helpers';
import { normalizeDirectoryPath } from '../_shared/path';
import { asStructuredOrText } from '../_shared/result';
import type { StatPathArgs } from './schema';

export const executeStatPath = async (
	app: App,
	args: StatPathArgs,
): Promise<unknown> => {
	const normalizedPath = normalizeDirectoryPath(args.target_path, 'target_path');
	const target = normalizedPath
		? getAbstractFileOrThrow(app, normalizedPath)
		: app.vault.getRoot();
	const adapterStat = normalizedPath
		? await app.vault.adapter.stat(normalizedPath)
		: null;
	const fileStat = target instanceof TFile ? getFileStat(target) : null;

	return asStructuredOrText(
		args.response_format,
		{
			target_path: normalizedPath || '/',
			type: target instanceof TFolder ? 'directory' : 'file',
			size: fileStat?.size ?? adapterStat?.size ?? 0,
			created: fileStat?.ctime ?? adapterStat?.ctime ?? null,
			modified: fileStat?.mtime ?? adapterStat?.mtime ?? null,
			accessed: null,
			permissions: 'N/A',
		},
		(structured) =>
			Object.entries(structured)
				.map(([key, value]) => `${key}: ${value}`)
				.join('\n'),
	);
};