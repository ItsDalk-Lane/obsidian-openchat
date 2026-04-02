import { t } from 'src/i18n/ai-runtime/helper';
import type { QueryIndexArgs } from './query-index/schema';
import type {
	ListDirectoryArgs,
	ReadMultipleFilesArgs,
	ReadTextFileArgs,
} from './filesystemToolSchemas';

type ReadArgNormalizationResult<TArgs> = {
	args: TArgs;
	warning: string | null;
};

const buildUnsupportedParamMessage = (mode: string, field: string): string =>
	t('{mode} mode does not support parameter {field}')
		.replace('{mode}', mode)
		.replace('{field}', field);

const normalizeUnsupportedStartLine = <TArgs extends { read_mode?: string; start_line?: number }>(
	args: TArgs
): ReadArgNormalizationResult<TArgs> => {
	if (args.start_line === undefined || args.read_mode === 'segment') {
		return { args, warning: null };
	}

	return {
		args: {
			...args,
			start_line: undefined,
		},
		warning: t('{mode} mode does not support start_line; it was removed automatically. Use segment mode for line-offset reads.')
			.replace('{mode}', String(args.read_mode)),
	};
};

export const parseReadTextFileArgs = (
	args: ReadTextFileArgs
): ReadArgNormalizationResult<ReadTextFileArgs> => {
	return normalizeUnsupportedStartLine(args);
};

export const parseReadMultipleFilesArgs = (
	args: ReadMultipleFilesArgs
): ReadArgNormalizationResult<ReadMultipleFilesArgs> => {
	return normalizeUnsupportedStartLine(args);
};

export const parseListDirectoryArgs = (
	args: ListDirectoryArgs,
	normalizeDirectoryPath: (input: string, fieldName?: string) => string
): ListDirectoryArgs => {
	if (args.view === 'vault') {
		if (args.include_sizes !== false) {
			throw new Error(buildUnsupportedParamMessage('vault', 'include_sizes'));
		}
		if (args.sort_by !== 'name') {
			throw new Error(buildUnsupportedParamMessage('vault', 'sort_by'));
		}
		if (args.regex !== undefined) {
			throw new Error(buildUnsupportedParamMessage('vault', 'regex'));
		}
		if ((args.exclude_patterns?.length ?? 0) > 0) {
			throw new Error(buildUnsupportedParamMessage('vault', 'exclude_patterns'));
		}
		if (args.limit !== 100) {
			throw new Error(buildUnsupportedParamMessage('vault', 'limit'));
		}
		if (args.offset !== 0) {
			throw new Error(buildUnsupportedParamMessage('vault', 'offset'));
		}
		if (args.max_depth !== 5) {
			throw new Error(buildUnsupportedParamMessage('vault', 'max_depth'));
		}
		if (args.max_nodes !== 200) {
			throw new Error(buildUnsupportedParamMessage('vault', 'max_nodes'));
		}
		const normalizedPath = normalizeDirectoryPath(args.directory_path ?? '/', 'directory_path');
		if (normalizedPath !== '') {
			throw new Error(
				t('Vault mode only supports traversing from the Vault root. Omit directory_path or pass /.')
			);
		}
		return args;
	}

	if (args.view === 'tree') {
		if (args.regex !== undefined) {
			throw new Error(buildUnsupportedParamMessage('tree', 'regex'));
		}
		if (args.include_sizes !== false) {
			throw new Error(buildUnsupportedParamMessage('tree', 'include_sizes'));
		}
		if (args.sort_by !== 'name') {
			throw new Error(buildUnsupportedParamMessage('tree', 'sort_by'));
		}
		if (args.limit !== 100) {
			throw new Error(buildUnsupportedParamMessage('tree', 'limit'));
		}
		if (args.offset !== 0) {
			throw new Error(buildUnsupportedParamMessage('tree', 'offset'));
		}
		if ((args.file_extensions?.length ?? 0) > 0) {
			throw new Error(buildUnsupportedParamMessage('tree', 'file_extensions'));
		}
		if (args.vault_limit !== 1_000) {
			throw new Error(buildUnsupportedParamMessage('tree', 'vault_limit'));
		}
		return args;
	}

	if ((args.exclude_patterns?.length ?? 0) > 0) {
		throw new Error(buildUnsupportedParamMessage('flat', 'exclude_patterns'));
	}
	if (args.max_depth !== 5) {
		throw new Error(buildUnsupportedParamMessage('flat', 'max_depth'));
	}
	if (args.max_nodes !== 200) {
		throw new Error(buildUnsupportedParamMessage('flat', 'max_nodes'));
	}
	if ((args.file_extensions?.length ?? 0) > 0) {
		throw new Error(buildUnsupportedParamMessage('flat', 'file_extensions'));
	}
	if (args.vault_limit !== 1_000) {
		throw new Error(buildUnsupportedParamMessage('flat', 'vault_limit'));
	}
	return args;
};

export const parseQueryIndexArgs = (args: QueryIndexArgs): QueryIndexArgs => {
	if (
		(args.select.fields?.length ?? 0) === 0
		&& (args.select.aggregates?.length ?? 0) === 0
	) {
		throw new Error(t('select.fields or select.aggregates must provide at least one item'));
	}

	for (const aggregate of args.select.aggregates ?? []) {
		if ((aggregate.aggregate === 'sum' || aggregate.aggregate === 'avg') && !aggregate.field) {
			throw new Error(
				t('{aggregate} aggregate requires field').replace('{aggregate}', aggregate.aggregate)
			);
		}
	}

	for (const condition of args.filters?.conditions ?? []) {
		if (condition.operator === 'in' && !Array.isArray(condition.value)) {
			throw new Error(t('operator=in requires value to be an array'));
		}
		if (condition.operator !== 'in' && Array.isArray(condition.value)) {
			throw new Error(
				t('operator={operator} does not accept an array value')
					.replace('{operator}', condition.operator)
			);
		}
	}

	return args;
};
