import type { App } from 'obsidian';
import type { ListDirectoryArgs } from '../filesystemToolSchemas';
import type { ListVaultOverviewArgs } from './schema';

export const buildListVaultOverviewArgs = (
	input: ListVaultOverviewArgs,
): ListDirectoryArgs => ({
	directory_path: '/',
	view: 'vault',
	include_sizes: false,
	sort_by: 'name',
	regex: undefined,
	exclude_patterns: [],
	limit: 100,
	offset: 0,
	max_depth: 5,
	max_nodes: 200,
	file_extensions: input.file_extensions,
	vault_limit: input.vault_limit,
	response_format: 'json',
});

export const executeListVaultOverview = async (
	app: App,
	input: ListVaultOverviewArgs,
): Promise<unknown> => {
	const { executeListDirectory } = await import('../filesystemListDirSupport');
	return executeListDirectory(app, buildListVaultOverviewArgs(input));
};
