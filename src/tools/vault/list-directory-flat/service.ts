import type { App } from 'obsidian';
import { executeListDirectory } from '../filesystemListDirSupport';
import type { ListDirectoryArgs } from '../filesystemToolSchemas';
import type { ListDirectoryFlatArgs } from './schema';

export const buildListDirectoryFlatArgs = (
	input: ListDirectoryFlatArgs,
): ListDirectoryArgs => ({
	directory_path: input.directory_path,
	view: 'flat',
	include_sizes: input.include_sizes,
	sort_by: input.sort_by,
	regex: input.regex,
	exclude_patterns: [],
	limit: input.limit,
	offset: input.offset,
	max_depth: 5,
	max_nodes: 200,
	file_extensions: [],
	vault_limit: 1_000,
	response_format: 'json',
});

export const executeListDirectoryFlat = (
	app: App,
	input: ListDirectoryFlatArgs,
): unknown => executeListDirectory(app, buildListDirectoryFlatArgs(input));
