import type { App } from 'obsidian';
import { executeListDirectory } from '../filesystemListDirSupport';
import type { ListDirectoryArgs } from '../filesystemToolSchemas';
import type { ListDirectoryTreeArgs } from './schema';

export const buildListDirectoryTreeArgs = (
	input: ListDirectoryTreeArgs,
): ListDirectoryArgs => ({
	directory_path: input.directory_path,
	view: 'tree',
	include_sizes: false,
	sort_by: 'name',
	regex: undefined,
	exclude_patterns: input.exclude_patterns,
	limit: 100,
	offset: 0,
	max_depth: input.max_depth,
	max_nodes: input.max_nodes,
	file_extensions: [],
	vault_limit: 1_000,
	response_format: 'json',
});

export const executeListDirectoryTree = (
	app: App,
	input: ListDirectoryTreeArgs,
): unknown => executeListDirectory(app, buildListDirectoryTreeArgs(input));
