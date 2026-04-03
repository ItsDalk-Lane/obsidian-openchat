import type { App } from 'obsidian';
import type { ListDirectoryArgs } from './schema';

export const summarizeListDirectoryTarget = (
	args: Partial<ListDirectoryArgs>,
): string | null => {
	const directoryPath = args.directory_path ?? '/';
	const view = args.view ?? 'flat';
	return view === 'vault' ? 'vault' : `${directoryPath} (${view})`;
};

export const describeListDirectoryActivity = (
	args: Partial<ListDirectoryArgs>,
): string | null => {
	const summary = summarizeListDirectoryTarget(args);
	return summary ? `浏览目录 ${summary}` : '浏览目录';
};

export const executeLegacyListDirectory = (
	app: App,
	args: ListDirectoryArgs,
): Promise<unknown> => import('../filesystemListDirSupport')
	.then(({ executeListDirectory }) => executeListDirectory(app, args));