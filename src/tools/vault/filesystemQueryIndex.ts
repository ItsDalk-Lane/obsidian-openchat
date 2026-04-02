import type {
	QueryIndexArgs,
	QueryIndexDataSource,
	QueryIndexScalar,
} from './query-index/schema';

const QUERY_INDEX_PUBLIC_FIELDS: Record<QueryIndexDataSource, Record<string, string>> = {
	file: {
		path: 'path',
		name: 'name',
		basename: 'basename',
		extension: 'extension',
		size: 'size',
		created: 'created',
		modified: 'modified',
		parent: 'parent',
	},
	property: {
		name: 'name',
		type: 'type',
		usage_count: 'usageCount',
	},
	tag: {
		tag: 'tag',
		count: 'count',
		file_count: 'fileCount',
		first_seen: 'firstSeen',
	},
	task: {
		file_path: 'filePath',
		line: 'line',
		text: 'text',
		completed: 'completed',
		status: 'status',
		parent_line: 'parentLine',
		priority: 'priority',
	},
};

const QUERY_INDEX_IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

const assertQueryIndexIdentifier = (value: string, label: string): void => {
	if (!QUERY_INDEX_IDENTIFIER_REGEX.test(value)) {
		throw new Error(`${label} 必须是字母、数字和下划线组成的标识符，且不能以数字开头`);
	}
};

const listQueryIndexFields = (dataSource: QueryIndexDataSource): string =>
	Object.keys(QUERY_INDEX_PUBLIC_FIELDS[dataSource]).sort().join(', ');

const toQueryIndexInternalField = (
	dataSource: QueryIndexDataSource,
	publicField: string,
	label: string
): string => {
	const normalized = publicField.trim();
	const mapped = QUERY_INDEX_PUBLIC_FIELDS[dataSource][normalized];
	if (!mapped) {
		throw new Error(
			`${label} "${publicField}" 无效。${dataSource} 可用字段: ${listQueryIndexFields(dataSource)}`
		);
	}
	return mapped;
};

const toQueryIndexLiteral = (value: QueryIndexScalar | QueryIndexScalar[]): string => {
	if (Array.isArray(value)) {
		return `[${value.map((item) => toQueryIndexLiteral(item)).join(', ')}]`;
	}
	if (typeof value === 'string') {
		return JSON.stringify(value);
	}
	if (value === null) {
		return 'null';
	}
	return String(value);
};

export const buildQueryIndexExpression = (input: QueryIndexArgs): string => {
	const publicFields = input.select.fields ?? [];
	const aggregates = input.select.aggregates ?? [];
	const selectParts: string[] = [];

	for (const field of publicFields) {
		const internalField = toQueryIndexInternalField(input.data_source, field, 'select.fields');
		selectParts.push(`${internalField} as ${field}`);
	}

	for (const aggregate of aggregates) {
		const alias = aggregate.alias
			|| (aggregate.aggregate === 'count'
				? 'count'
				: `${aggregate.aggregate}_${aggregate.field}`);
		assertQueryIndexIdentifier(alias, 'aggregate alias');
		if (aggregate.aggregate === 'count') {
			selectParts.push(`count() as ${alias}`);
			continue;
		}
		const field = toQueryIndexInternalField(
			input.data_source,
			aggregate.field ?? '',
			'select.aggregates.field'
		);
		selectParts.push(`${aggregate.aggregate}(${field}) as ${alias}`);
	}

	const expressionParts = [
		`select(${selectParts.join(', ')})`,
		`from(${input.data_source})`,
	];

	if (input.filters && input.filters.conditions.length > 0) {
		const operator = input.filters.match === 'any' ? ' || ' : ' && ';
		const conditionText = input.filters.conditions
			.map((condition) => {
				const internalField = toQueryIndexInternalField(
					input.data_source,
					condition.field,
					'filters.conditions.field'
				);
				const mappedOperator = {
					eq: '==',
					ne: '!=',
					gt: '>',
					gte: '>=',
					lt: '<',
					lte: '<=',
					contains: 'contains',
					in: 'in',
					matches: 'matches',
				}[condition.operator];
				return `${internalField} ${mappedOperator} ${toQueryIndexLiteral(condition.value)}`;
			})
			.join(operator);
		expressionParts.push(`where(${conditionText})`);
	}

	if (input.group_by) {
		expressionParts.push(
			`groupBy(${toQueryIndexInternalField(input.data_source, input.group_by, 'group_by')})`
		);
	}

	if (input.order_by) {
		assertQueryIndexIdentifier(input.order_by.field, 'order_by.field');
		expressionParts.push(`orderBy(${input.order_by.field} ${input.order_by.direction})`);
	}

	if (input.limit !== undefined) {
		expressionParts.push(`limit(${input.limit})`);
	}
	if (input.offset !== undefined) {
		expressionParts.push(`offset(${input.offset})`);
	}

	return expressionParts.join('.');
};
