import {
	listDirectoryFlatSchema,
	type ListDirectoryFlatArgs,
} from './list-directory-flat/schema'
import {
	listDirectoryTreeSchema,
	type ListDirectoryTreeArgs,
} from './list-directory-tree/schema'
import {
	listVaultOverviewSchema,
	type ListVaultOverviewArgs,
} from './list-vault-overview/schema'
import type { ListDirectoryArgs } from './filesystemToolSchemas'

const buildListDirectoryFlatArgs = (
	input: ListDirectoryFlatArgs,
): ListDirectoryArgs => ({
	directory_path: input.directory_path,
	view: 'flat',
	include_sizes: input.include_sizes,
	sort_by: input.sort_by,
	regex: input.regex,
	limit: input.limit,
	offset: input.offset,
	response_format: 'json',
})

const buildListDirectoryTreeArgs = (
	input: ListDirectoryTreeArgs,
): ListDirectoryArgs => ({
	directory_path: input.directory_path,
	view: 'tree',
	exclude_patterns: input.exclude_patterns,
	max_depth: input.max_depth,
	max_nodes: input.max_nodes,
	response_format: 'json',
})

const buildListVaultOverviewArgs = (
	input: ListVaultOverviewArgs,
): ListDirectoryArgs => ({
	directory_path: '/',
	view: 'vault',
	file_extensions: input.file_extensions,
	vault_limit: input.vault_limit,
	response_format: 'json',
})

export {
	buildListDirectoryFlatArgs,
	buildListDirectoryTreeArgs,
	buildListVaultOverviewArgs,
	listDirectoryFlatSchema,
	listDirectoryTreeSchema,
	listVaultOverviewSchema,
}
export type {
	ListDirectoryFlatArgs,
	ListDirectoryTreeArgs,
	ListVaultOverviewArgs,
}
