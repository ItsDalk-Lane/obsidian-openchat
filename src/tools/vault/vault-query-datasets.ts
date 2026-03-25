import { App, TFile } from 'obsidian';
import { localInstance } from 'src/i18n/locals';
import {
	type PropertyInfoLike,
	type QueryAggregateSelectItem,
	type QueryFieldSelectItem,
	type QueryPlan,
	type VaultQueryDataSource,
	type VaultQueryDataset,
	DATA_SOURCE_FIELDS,
	PRIORITY_PATTERNS,
	createQueryError,
	formatLocal,
} from './vault-query-types';
import { toComparableNumber } from './vault-query-condition';

const inferPropertyType = (value: unknown): string => {
	if (typeof value === 'boolean') {
		return 'checkbox';
	}
	if (typeof value === 'number') {
		return 'number';
	}
	if (Array.isArray(value)) {
		return 'multitext';
	}
	if (typeof value === 'string') {
		if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
			return 'datetime';
		}
		if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
			return 'date';
		}
		return 'text';
	}
	return 'text';
};

const mergePropertyTypes = (current: string | null, next: string): string => {
	if (!current) {
		return next;
	}
	return current === next ? current : 'mixed';
};

const buildFileDataset = (app: App): VaultQueryDataset => {
	const files = app.vault.getFiles();
	return {
		rows: files.map((file) => ({
			path: file.path,
			name: file.name,
			basename: file.basename,
			extension: file.extension,
			size: file.stat?.size ?? 0,
			created: file.stat?.ctime ?? 0,
			modified: file.stat?.mtime ?? 0,
			parent: file.parent?.path || '/',
		})),
		fields: DATA_SOURCE_FIELDS.file,
	};
};

const getMarkdownFiles = (app: App): TFile[] => {
	return app.vault.getFiles().filter((file) => file.extension === 'md');
};

const buildPropertyDataset = (app: App): VaultQueryDataset => {
	const markdownFiles = getMarkdownFiles(app);
	const stats = new Map<string, { type: string | null; usageCount: number }>();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const metadataTypeManager = (app as any).metadataTypeManager as
		| { getAllProperties?: () => Record<string, PropertyInfoLike> }
		| undefined;
	const propertyDefinitions = metadataTypeManager?.getAllProperties?.() ?? {};

	for (const key of Object.keys(propertyDefinitions)) {
		const property = propertyDefinitions[key];
		const name = property?.name ?? key;
		const type = property?.widget ?? property?.type ?? null;
		stats.set(name, {
			type: type ? String(type) : null,
			usageCount: 0,
		});
	}

	for (const file of markdownFiles) {
		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (!frontmatter) continue;
		for (const [name, value] of Object.entries(frontmatter)) {
			const current = stats.get(name) ?? { type: null, usageCount: 0 };
			current.type = mergePropertyTypes(current.type, inferPropertyType(value));
			current.usageCount += 1;
			stats.set(name, current);
		}
	}

	return {
		rows: Array.from(stats.entries()).map(([name, info]) => ({
			name,
			type: info.type ?? 'text',
			usageCount: info.usageCount,
		})),
		fields: DATA_SOURCE_FIELDS.property,
	};
};

const buildTagDataset = (app: App): VaultQueryDataset => {
	const stats = new Map<
		string,
		{ count: number; fileSet: Set<string>; firstSeen: number | null }
	>();

	for (const file of getMarkdownFiles(app)) {
		const tags = app.metadataCache.getFileCache(file)?.tags ?? [];
		for (const tagEntry of tags) {
			const tag = tagEntry.tag;
			const current = stats.get(tag) ?? {
				count: 0,
				fileSet: new Set<string>(),
				firstSeen: null,
			};
			current.count += 1;
			current.fileSet.add(file.path);
			current.firstSeen =
				current.firstSeen === null
					? file.stat?.ctime ?? null
					: Math.min(current.firstSeen, file.stat?.ctime ?? current.firstSeen);
			stats.set(tag, current);
		}
	}

	return {
		rows: Array.from(stats.entries()).map(([tag, info]) => ({
			tag,
			count: info.count,
			fileCount: info.fileSet.size,
			firstSeen: info.firstSeen,
		})),
		fields: DATA_SOURCE_FIELDS.tag,
	};
};

const detectTaskPriority = (text: string): string | null => {
	for (const entry of PRIORITY_PATTERNS) {
		if (entry.pattern.test(text)) {
			return entry.value;
		}
	}
	return null;
};

const buildTaskDataset = async (app: App): Promise<VaultQueryDataset> => {
	const rows: Array<Record<string, unknown>> = [];

	for (const file of getMarkdownFiles(app)) {
		const cache = app.metadataCache.getFileCache(file);
		const listItems = cache?.listItems ?? [];
		const taskItems = listItems.filter((item) => typeof item.task !== 'undefined');
		if (taskItems.length === 0) {
			continue;
		}

		const lines = (await app.vault.cachedRead(file)).split(/\r?\n/);
		for (const item of taskItems) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const lineNumber = ((item as any).position?.start?.line ?? -1) as number;
			if (lineNumber < 0 || lineNumber >= lines.length) {
				continue;
			}
			const text = lines[lineNumber];
			rows.push({
				filePath: file.path,
				line: lineNumber + 1,
				text,
				completed: item.task !== ' ',
				status: item.task ?? null,
				parentLine: item.parent >= 0 ? item.parent + 1 : null,
				priority: detectTaskPriority(text),
			});
		}
	}

	return {
		rows,
		fields: DATA_SOURCE_FIELDS.task,
	};
};

export const getDataset = async (
	app: App,
	source: VaultQueryDataSource
): Promise<VaultQueryDataset> => {
	switch (source) {
		case 'file':
			return buildFileDataset(app);
		case 'property':
			return buildPropertyDataset(app);
		case 'tag':
			return buildTagDataset(app);
		case 'task':
			return await buildTaskDataset(app);
		default:
			throw createQueryError(
				formatLocal(localInstance.mcp_fs_query_invalid_source, source)
			);
	}
};

const getAggregateValue = (
	func: QueryAggregateSelectItem['func'],
	field: string | undefined,
	rows: Array<Record<string, unknown>>
): number => {
	if (func === 'count') {
		return rows.length;
	}

	const numericValues = rows
		.map((row) => toComparableNumber(field ? row[field] : undefined))
		.filter((value) => Number.isFinite(value));

	if (numericValues.length === 0) {
		return 0;
	}

	if (func === 'sum') {
		return numericValues.reduce((sum, value) => sum + value, 0);
	}

	return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
};

export const applySelection = (
	rows: Array<Record<string, unknown>>,
	plan: QueryPlan
): Array<Record<string, unknown>> => {
	const aggregateItems = plan.select.filter(
		(item): item is QueryAggregateSelectItem => item.kind === 'aggregate'
	);
	const fieldItems = plan.select.filter(
		(item): item is QueryFieldSelectItem => item.kind === 'field'
	);

	if (plan.groupBy) {
		const groups = new Map<string, Array<Record<string, unknown>>>();
		for (const row of rows) {
			const key = JSON.stringify(row[plan.groupBy]);
			const groupRows = groups.get(key) ?? [];
			groupRows.push(row);
			groups.set(key, groupRows);
		}

		return Array.from(groups.values()).map((groupRows) => {
			const firstRow = groupRows[0] ?? {};
			const output: Record<string, unknown> = {};
			for (const item of fieldItems) {
				if (item.field !== plan.groupBy) {
					throw createQueryError(
						formatLocal(
							localInstance.mcp_fs_query_group_field_required,
							item.field
						)
					);
				}
				output[item.alias] = firstRow[item.field];
			}
			for (const item of aggregateItems) {
				output[item.alias] = getAggregateValue(item.func, item.field, groupRows);
			}
			return output;
		});
	}

	if (aggregateItems.length > 0 && fieldItems.length > 0) {
		throw createQueryError(localInstance.mcp_fs_query_mixed_select_requires_group);
	}

	if (aggregateItems.length > 0) {
		const output: Record<string, unknown> = {};
		for (const item of aggregateItems) {
			output[item.alias] = getAggregateValue(item.func, item.field, rows);
		}
		return [output];
	}

	return rows.map((row) => {
		const output: Record<string, unknown> = {};
		for (const item of fieldItems) {
			output[item.alias] = row[item.field];
		}
		return output;
	});
};
