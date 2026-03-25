import type {
	ListDirectoryArgs,
	QueryIndexArgs,
	ReadMultipleFilesArgs,
	ReadTextFileArgs,
} from './filesystemToolSchemas';

export const parseReadTextFileArgs = (args: ReadTextFileArgs): ReadTextFileArgs => {
	if (args.start_line !== undefined && args.read_mode !== 'segment') {
		throw new Error(`${args.read_mode} 模式不支持参数 start_line`);
	}
	return args;
};

export const parseReadMultipleFilesArgs = (
	args: ReadMultipleFilesArgs
): ReadMultipleFilesArgs => {
	if (args.start_line !== undefined && args.read_mode !== 'segment') {
		throw new Error(`${args.read_mode} 模式不支持参数 start_line`);
	}
	return args;
};

export const parseListDirectoryArgs = (
	args: ListDirectoryArgs,
	normalizeDirectoryPath: (input: string, fieldName?: string) => string
): ListDirectoryArgs => {
	if (args.view === 'vault') {
		if (args.include_sizes !== false) {
			throw new Error('vault 模式不支持参数 include_sizes');
		}
		if (args.sort_by !== 'name') {
			throw new Error('vault 模式不支持参数 sort_by');
		}
		if (args.regex !== undefined) {
			throw new Error('vault 模式不支持参数 regex');
		}
		if ((args.exclude_patterns?.length ?? 0) > 0) {
			throw new Error('vault 模式不支持参数 exclude_patterns');
		}
		if (args.limit !== 100) {
			throw new Error('vault 模式不支持参数 limit');
		}
		if (args.offset !== 0) {
			throw new Error('vault 模式不支持参数 offset');
		}
		if (args.max_depth !== 5) {
			throw new Error('vault 模式不支持参数 max_depth');
		}
		if (args.max_nodes !== 200) {
			throw new Error('vault 模式不支持参数 max_nodes');
		}
		const normalizedPath = normalizeDirectoryPath(args.directory_path ?? '/', 'directory_path');
		if (normalizedPath !== '') {
			throw new Error('vault 模式只支持从 Vault 根目录遍历；请省略 directory_path 或传 /');
		}
		return args;
	}

	if (args.view === 'tree') {
		if (args.regex !== undefined) {
			throw new Error('tree 模式不支持参数 regex');
		}
		if (args.include_sizes !== false) {
			throw new Error('tree 模式不支持参数 include_sizes');
		}
		if (args.sort_by !== 'name') {
			throw new Error('tree 模式不支持参数 sort_by');
		}
		if (args.limit !== 100) {
			throw new Error('tree 模式不支持参数 limit');
		}
		if (args.offset !== 0) {
			throw new Error('tree 模式不支持参数 offset');
		}
		if ((args.file_extensions?.length ?? 0) > 0) {
			throw new Error('tree 模式不支持参数 file_extensions');
		}
		if (args.vault_limit !== 1_000) {
			throw new Error('tree 模式不支持参数 vault_limit');
		}
		return args;
	}

	if ((args.exclude_patterns?.length ?? 0) > 0) {
		throw new Error('flat 模式不支持参数 exclude_patterns');
	}
	if (args.max_depth !== 5) {
		throw new Error('flat 模式不支持参数 max_depth');
	}
	if (args.max_nodes !== 200) {
		throw new Error('flat 模式不支持参数 max_nodes');
	}
	if ((args.file_extensions?.length ?? 0) > 0) {
		throw new Error('flat 模式不支持参数 file_extensions');
	}
	if (args.vault_limit !== 1_000) {
		throw new Error('flat 模式不支持参数 vault_limit');
	}
	return args;
};

export const parseQueryIndexArgs = (args: QueryIndexArgs): QueryIndexArgs => {
	if (
		(args.select.fields?.length ?? 0) === 0
		&& (args.select.aggregates?.length ?? 0) === 0
	) {
		throw new Error('select.fields 或 select.aggregates 至少需要提供一个');
	}

	for (const aggregate of args.select.aggregates ?? []) {
		if ((aggregate.aggregate === 'sum' || aggregate.aggregate === 'avg') && !aggregate.field) {
			throw new Error(`${aggregate.aggregate} 聚合必须提供 field`);
		}
	}

	for (const condition of args.filters?.conditions ?? []) {
		if (condition.operator === 'in' && !Array.isArray(condition.value)) {
			throw new Error('operator=in 时 value 必须是数组');
		}
		if (condition.operator !== 'in' && Array.isArray(condition.value)) {
			throw new Error(`operator=${condition.operator} 时 value 不能是数组`);
		}
	}

	return args;
};
