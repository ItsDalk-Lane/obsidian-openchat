import { localInstance } from 'src/i18n/locals';
import { resolveRegex } from './helpers';
import {
	type ConditionNode,
	type QueryPlan,
	createQueryError,
	formatLocal,
	wrapQueryError,
} from './vault-query-types';

const collectConditionIdentifiers = (
	node: ConditionNode,
	identifiers: Set<string>
): void => {
	if (node.type === 'identifier') {
		identifiers.add(node.name);
		return;
	}
	if (node.type === 'unary') {
		collectConditionIdentifiers(node.operand, identifiers);
		return;
	}
	if (node.type === 'binary') {
		collectConditionIdentifiers(node.left, identifiers);
		collectConditionIdentifiers(node.right, identifiers);
	}
};

const validateFieldName = (field: string, allowedFields: Set<string>): void => {
	if (!allowedFields.has(field)) {
		throw createQueryError(
			formatLocal(localInstance.mcp_fs_query_unknown_field, field)
		);
	}
};

export const validatePlanFields = (
	plan: QueryPlan,
	allowedFields: Set<string>
): void => {
	if (plan.groupBy) {
		validateFieldName(plan.groupBy, allowedFields);
	}

	for (const item of plan.select) {
		if (item.kind === 'field') {
			validateFieldName(item.field, allowedFields);
			continue;
		}
		if (item.field) {
			validateFieldName(item.field, allowedFields);
		}
	}

	const identifiers = new Set<string>();
	if (plan.where) {
		collectConditionIdentifiers(plan.where, identifiers);
	}
	for (const condition of plan.andGroups) {
		collectConditionIdentifiers(condition, identifiers);
	}
	for (const condition of plan.orGroups) {
		collectConditionIdentifiers(condition, identifiers);
	}
	for (const identifier of identifiers) {
		validateFieldName(identifier, allowedFields);
	}
};

export const toComparableNumber = (value: unknown): number => {
	if (typeof value === 'number') {
		return value;
	}
	// 仅在非空字符串时尝试数值比较，空字符串仍保留给后续字符串比较分支处理。
	if (typeof value === 'string' && value.trim()) {
		const numeric = Number(value);
		if (!Number.isNaN(numeric)) {
			return numeric;
		}
	}
	return NaN;
};

const toRegexFromValue = (value: unknown): RegExp => {
	if (typeof value !== 'string') {
		throw wrapQueryError('matches 右侧必须是字符串');
	}
	const match = value.match(/^\/(.+)\/([a-z]*)$/i);
	if (match) {
		try {
			return new RegExp(match[1], match[2]);
		} catch (error) {
			throw wrapQueryError(
				error instanceof Error ? error.message : String(error)
			);
		}
	}
	return resolveRegex(value) ?? /.^/;
};

const evaluateConditionNode = (
	node: ConditionNode,
	row: Record<string, unknown>
): unknown => {
	switch (node.type) {
		case 'identifier':
			return row[node.name];
		case 'literal':
			return node.value;
		case 'array':
			return node.items.map((item) => item.value);
		case 'unary':
			return !evaluateConditionNode(node.operand, row);
		case 'binary': {
			if (node.operator === '&&') {
				return Boolean(evaluateConditionNode(node.left, row))
					&& Boolean(evaluateConditionNode(node.right, row));
			}
			if (node.operator === '||') {
				return Boolean(evaluateConditionNode(node.left, row))
					|| Boolean(evaluateConditionNode(node.right, row));
			}

			const left = evaluateConditionNode(node.left, row);
			const right = evaluateConditionNode(node.right, row);
			const comparison = compareValues(left, right);

			switch (node.operator) {
				case '==':
					return left === right;
				case '!=':
					return left !== right;
				case '>':
					return comparison > 0;
				case '>=':
					return comparison >= 0;
				case '<':
					return comparison < 0;
				case '<=':
					return comparison <= 0;
				case 'contains':
					if (Array.isArray(left)) {
						return left.includes(right);
					}
					return String(left ?? '').includes(String(right ?? ''));
				case 'in':
					if (Array.isArray(right)) {
						return right.includes(left);
					}
					return String(right ?? '').includes(String(left ?? ''));
				case 'matches':
					return toRegexFromValue(right).test(String(left ?? ''));
				default:
					return false;
			}
		}
		default:
			return null;
	}
};

export const applyConditions = (
	rows: Array<Record<string, unknown>>,
	plan: QueryPlan
): Array<Record<string, unknown>> => {
	return rows.filter((row) => {
		let result = plan.where
			? Boolean(evaluateConditionNode(plan.where, row))
			: true;

		for (const condition of plan.andGroups) {
			result = result && Boolean(evaluateConditionNode(condition, row));
		}
		for (const condition of plan.orGroups) {
			result = result || Boolean(evaluateConditionNode(condition, row));
		}
		return result;
	});
};

const compareValues = (left: unknown, right: unknown): number => {
	if (left === right) return 0;
	const leftIsNullish = left === null || typeof left === 'undefined';
	const rightIsNullish = right === null || typeof right === 'undefined';
	if (leftIsNullish && rightIsNullish) return 0;
	if (leftIsNullish) return 1;
	if (rightIsNullish) return -1;

	const normalizedLeftNumber =
		typeof left === 'boolean' ? Number(left) : toComparableNumber(left);
	const normalizedRightNumber =
		typeof right === 'boolean' ? Number(right) : toComparableNumber(right);
	if (
		Number.isFinite(normalizedLeftNumber)
		&& Number.isFinite(normalizedRightNumber)
	) {
		if (normalizedLeftNumber === normalizedRightNumber) {
			return 0;
		}
		return normalizedLeftNumber < normalizedRightNumber ? -1 : 1;
	}

	return String(left).localeCompare(String(right));
};

export const applyOrderBy = (
	rows: Array<Record<string, unknown>>,
	orderBy?: { field: string; direction: 'asc' | 'desc' }
): Array<Record<string, unknown>> => {
	if (!orderBy) {
		return rows;
	}

	return [...rows].sort((left, right) => {
		const comparison = compareValues(left[orderBy.field], right[orderBy.field]);
		return orderBy.direction === 'desc' ? -comparison : comparison;
	});
};

export const validateOrderByField = (
	orderBy: QueryPlan['orderBy'],
	columns: string[],
	rows: Array<Record<string, unknown>>
): void => {
	if (!orderBy) {
		return;
	}
	const outputFields = new Set<string>(columns);
	if (rows[0]) {
		for (const key of Object.keys(rows[0])) {
			outputFields.add(key);
		}
	}
	if (!outputFields.has(orderBy.field)) {
		throw createQueryError(
			formatLocal(localInstance.mcp_fs_query_invalid_order_by, orderBy.field)
		);
	}
};
