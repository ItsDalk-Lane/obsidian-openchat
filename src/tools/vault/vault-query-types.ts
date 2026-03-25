import { localInstance } from 'src/i18n/locals';

export type VaultQueryDataSource = 'file' | 'property' | 'tag' | 'task';

export interface QueryMethodCall {
	name: string;
	args: string;
}

export interface QueryPlan {
	select: QuerySelectItem[];
	from: VaultQueryDataSource;
	where?: ConditionNode;
	andGroups: ConditionNode[];
	orGroups: ConditionNode[];
	groupBy?: string;
	orderBy?: {
		field: string;
		direction: 'asc' | 'desc';
	};
	limit?: number;
	offset?: number;
}

export type QuerySelectItem = QueryFieldSelectItem | QueryAggregateSelectItem;

export interface QueryFieldSelectItem {
	kind: 'field';
	field: string;
	alias: string;
}

export interface QueryAggregateSelectItem {
	kind: 'aggregate';
	func: 'count' | 'sum' | 'avg';
	field?: string;
	alias: string;
}

export type ConditionNode =
	| ConditionIdentifierNode
	| ConditionLiteralNode
	| ConditionArrayNode
	| ConditionUnaryNode
	| ConditionBinaryNode;

export interface ConditionIdentifierNode {
	type: 'identifier';
	name: string;
}

export interface ConditionLiteralNode {
	type: 'literal';
	value: string | number | boolean | null;
}

export interface ConditionArrayNode {
	type: 'array';
	items: ConditionLiteralNode[];
}

export interface ConditionUnaryNode {
	type: 'unary';
	operator: '!';
	operand: ConditionNode;
}

export interface ConditionBinaryNode {
	type: 'binary';
	operator:
		| '&&'
		| '||'
		| '=='
		| '!='
		| '>'
		| '>='
		| '<'
		| '<='
		| 'contains'
		| 'in'
		| 'matches';
	left: ConditionNode;
	right: ConditionNode;
}

export interface ConditionToken {
	type:
		| 'identifier'
		| 'string'
		| 'number'
		| 'boolean'
		| 'null'
		| 'operator'
		| 'lparen'
		| 'rparen'
		| 'lbracket'
		| 'rbracket'
		| 'comma';
	value?: string | number | boolean | null;
}

export interface VaultQueryDataset {
	rows: Array<Record<string, unknown>>;
	fields: string[];
}

export interface PropertyInfoLike {
	name?: string;
	type?: string;
	widget?: string;
}

export const DATA_SOURCE_FIELDS: Record<VaultQueryDataSource, string[]> = {
	file: ['path', 'name', 'basename', 'extension', 'size', 'created', 'modified', 'parent'],
	property: ['name', 'type', 'usageCount'],
	tag: ['tag', 'count', 'fileCount', 'firstSeen'],
	task: ['filePath', 'line', 'text', 'completed', 'status', 'parentLine', 'priority'],
};

export const PRIORITY_PATTERNS: Array<{ pattern: RegExp; value: string }> = [
	{ pattern: /⏫/, value: 'highest' },
	{ pattern: /🔺/, value: 'high' },
	{ pattern: /🔼/, value: 'medium' },
	{ pattern: /🔽/, value: 'low' },
	{ pattern: /⏬/, value: 'lowest' },
];

export const IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const formatLocal = (
	template: string,
	...values: Array<string | number>
): string => {
	return values.reduce<string>((text, value, index) => {
		return text.replace(new RegExp(`\\{${index}\\}`, 'g'), String(value));
	}, template);
};

export const createQueryError = (message: string): Error => {
	return new Error(message);
};

export const wrapQueryError = (detail: string): Error => {
	return createQueryError(
		formatLocal(localInstance.mcp_fs_query_invalid_expression, detail)
	);
};
