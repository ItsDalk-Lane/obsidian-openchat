import { localInstance } from 'src/i18n/locals';
import { parseConditionExpression } from './vault-query-condition-parser';
import {
	type QueryMethodCall,
	type QueryPlan,
	type QuerySelectItem,
	type VaultQueryDataSource,
	IDENTIFIER_REGEX,
	createQueryError,
	formatLocal,
	wrapQueryError,
} from './vault-query-types';

const stripWrappingQuotes = (input: string): string => {
	const trimmed = input.trim();
	if (trimmed.length < 2) return trimmed;
	const quote = trimmed[0];
	if ((quote === '"' || quote === '\'') && trimmed.endsWith(quote)) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
};

const splitTopLevel = (input: string, delimiter = ','): string[] => {
	const parts: string[] = [];
	let current = '';
	let parenDepth = 0;
	let bracketDepth = 0;
	let quote: '"' | '\'' | null = null;

	for (let index = 0; index < input.length; index += 1) {
		const char = input[index];
		if (quote) {
			current += char;
			if (char === '\\') {
				if (index + 1 < input.length) {
					current += input[index + 1];
					index += 1;
				}
				continue;
			}
			if (char === quote) {
				quote = null;
			}
			continue;
		}

		if (char === '"' || char === '\'') {
			quote = char;
			current += char;
			continue;
		}

		if (char === '(') {
			parenDepth += 1;
			current += char;
			continue;
		}
		if (char === ')') {
			parenDepth = Math.max(0, parenDepth - 1);
			current += char;
			continue;
		}
		if (char === '[') {
			bracketDepth += 1;
			current += char;
			continue;
		}
		if (char === ']') {
			bracketDepth = Math.max(0, bracketDepth - 1);
			current += char;
			continue;
		}

		if (char === delimiter && parenDepth === 0 && bracketDepth === 0) {
			if (current.trim()) {
				parts.push(current.trim());
			}
			current = '';
			continue;
		}

		current += char;
	}

	if (current.trim()) {
		parts.push(current.trim());
	}

	return parts;
};

const readBalancedSegment = (
	input: string,
	startIndex: number
): { content: string; nextIndex: number } => {
	let depth = 1;
	let quote: '"' | '\'' | null = null;

	for (let index = startIndex + 1; index < input.length; index += 1) {
		const char = input[index];
		if (quote) {
			if (char === '\\') {
				index += 1;
				continue;
			}
			if (char === quote) {
				quote = null;
			}
			continue;
		}

		if (char === '"' || char === '\'') {
			quote = char;
			continue;
		}

		if (char === '(') {
			depth += 1;
			continue;
		}
		if (char === ')') {
			depth -= 1;
			if (depth === 0) {
				return {
					content: input.slice(startIndex + 1, index),
					nextIndex: index + 1,
				};
			}
		}
	}

	throw wrapQueryError('括号未正确闭合');
};

const parseMethodChain = (expression: string): QueryMethodCall[] => {
	const trimmed = String(expression ?? '').trim();
	if (!trimmed) {
		throw wrapQueryError('查询表达式不能为空');
	}

	const calls: QueryMethodCall[] = [];
	let index = 0;

	while (index < trimmed.length) {
		while (/\s/.test(trimmed[index] ?? '')) {
			index += 1;
		}

		const identifierStart = index;
		while (/[A-Za-z]/.test(trimmed[index] ?? '')) {
			index += 1;
		}
		const name = trimmed.slice(identifierStart, index);
		if (!name) {
			throw wrapQueryError(`第 ${index + 1} 个字符附近缺少方法名`);
		}

		while (/\s/.test(trimmed[index] ?? '')) {
			index += 1;
		}
		if (trimmed[index] !== '(') {
			throw wrapQueryError(`方法 ${name} 缺少参数括号`);
		}

		const segment = readBalancedSegment(trimmed, index);
		calls.push({
			name,
			args: segment.content.trim(),
		});
		index = segment.nextIndex;

		while (/\s/.test(trimmed[index] ?? '')) {
			index += 1;
		}

		if (index >= trimmed.length) {
			break;
		}
		if (trimmed[index] !== '.') {
			throw wrapQueryError(`方法 ${name} 之后缺少链式分隔符 .`);
		}
		index += 1;
	}

	return calls;
};

const parseSelectItem = (input: string): QuerySelectItem => {
	const aggregateMatch = input.match(
		/^(count\(\)|sum\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)|avg\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\))(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/i
	);
	if (aggregateMatch) {
		const func = aggregateMatch[1]
			.slice(0, aggregateMatch[1].indexOf('('))
			.toLowerCase() as 'count' | 'sum' | 'avg';
		const field = aggregateMatch[2] || aggregateMatch[3] || undefined;
		if ((func === 'sum' || func === 'avg') && !field) {
			throw createQueryError(
				formatLocal(localInstance.mcp_fs_query_invalid_aggregate, input)
			);
		}
		return {
			kind: 'aggregate',
			func,
			field,
			alias:
				aggregateMatch[4]
				|| (func === 'count' ? 'count' : `${func}_${field}`),
		};
	}

	const fieldAliasMatch = input.match(
		/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/i
	);
	if (!fieldAliasMatch) {
		throw createQueryError(
			formatLocal(localInstance.mcp_fs_query_invalid_select, input)
		);
	}

	return {
		kind: 'field',
		field: fieldAliasMatch[1],
		alias: fieldAliasMatch[2] || fieldAliasMatch[1],
	};
};

const parseLimitValue = (value: string, methodName: 'limit' | 'offset'): number => {
	const normalized = stripWrappingQuotes(value);
	if (!/^\d+$/.test(normalized)) {
		throw wrapQueryError(`${methodName} 只接受非负整数`);
	}
	return Number(normalized);
};

const parseOrderBy = (
	value: string
): { field: string; direction: 'asc' | 'desc' } => {
	const normalized = stripWrappingQuotes(value);
	const parts = normalized.split(/\s+/).filter(Boolean);
	if (parts.length === 0 || parts.length > 2 || !IDENTIFIER_REGEX.test(parts[0])) {
		throw wrapQueryError(`orderBy 参数无效: ${value}`);
	}
	const direction = parts[1]?.toLowerCase() === 'desc' ? 'desc' : 'asc';
	if (parts[1] && !['asc', 'desc'].includes(parts[1].toLowerCase())) {
		throw wrapQueryError(`orderBy 排序方向无效: ${parts[1]}`);
	}
	return {
		field: parts[0],
		direction,
	};
};

export const parseQueryPlan = (expression: string): QueryPlan => {
	const calls = parseMethodChain(expression);
	const plan: QueryPlan = {
		select: [],
		from: 'file',
		andGroups: [],
		orGroups: [],
	};

	let hasSelect = false;
	let hasFrom = false;
	let hasWhere = false;
	let hasGroupBy = false;
	let hasOrderBy = false;
	let hasLimit = false;
	let hasOffset = false;

	for (const call of calls) {
		switch (call.name) {
			case 'select': {
				if (hasSelect) {
					throw wrapQueryError('select 只能出现一次');
				}
				const items = splitTopLevel(call.args).map(parseSelectItem);
				if (items.length === 0) {
					throw wrapQueryError('select 至少需要一个字段');
				}
				plan.select = items;
				hasSelect = true;
				break;
			}
			case 'from': {
				if (hasFrom) {
					throw wrapQueryError('from 只能出现一次');
				}
				const source = stripWrappingQuotes(call.args) as VaultQueryDataSource;
				if (!['file', 'property', 'tag', 'task'].includes(source)) {
					throw createQueryError(
						formatLocal(localInstance.mcp_fs_query_invalid_source, source)
					);
				}
				plan.from = source;
				hasFrom = true;
				break;
			}
			case 'where': {
				if (hasWhere) {
					throw wrapQueryError('where 只能出现一次');
				}
				plan.where = parseConditionExpression(stripWrappingQuotes(call.args));
				hasWhere = true;
				break;
			}
			case 'andGroup': {
				plan.andGroups.push(parseConditionExpression(stripWrappingQuotes(call.args)));
				break;
			}
			case 'orGroup': {
				plan.orGroups.push(parseConditionExpression(stripWrappingQuotes(call.args)));
				break;
			}
			case 'groupBy': {
				if (hasGroupBy) {
					throw wrapQueryError('groupBy 只能出现一次');
				}
				const field = stripWrappingQuotes(call.args);
				if (!IDENTIFIER_REGEX.test(field)) {
					throw wrapQueryError(`groupBy 字段无效: ${field}`);
				}
				plan.groupBy = field;
				hasGroupBy = true;
				break;
			}
			case 'orderBy': {
				if (hasOrderBy) {
					throw wrapQueryError('orderBy 只能出现一次');
				}
				plan.orderBy = parseOrderBy(call.args);
				hasOrderBy = true;
				break;
			}
			case 'limit': {
				if (hasLimit) {
					throw wrapQueryError('limit 只能出现一次');
				}
				plan.limit = parseLimitValue(call.args, 'limit');
				hasLimit = true;
				break;
			}
			case 'offset': {
				if (hasOffset) {
					throw wrapQueryError('offset 只能出现一次');
				}
				plan.offset = parseLimitValue(call.args, 'offset');
				hasOffset = true;
				break;
			}
			default:
				throw createQueryError(
					formatLocal(localInstance.mcp_fs_query_invalid_method, call.name)
				);
		}
	}

	if (!hasSelect) {
		throw createQueryError(localInstance.mcp_fs_query_missing_select);
	}
	if (!hasFrom) {
		throw createQueryError(localInstance.mcp_fs_query_missing_from);
	}

	const seenAliases = new Set<string>();
	for (const item of plan.select) {
		if (seenAliases.has(item.alias)) {
			throw createQueryError(
				formatLocal(localInstance.mcp_fs_query_duplicate_column, item.alias)
			);
		}
		seenAliases.add(item.alias);
	}

	return plan;
};
