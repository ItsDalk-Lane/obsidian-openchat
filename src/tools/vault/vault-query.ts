import { App } from 'obsidian';
import { DEFAULT_QUERY_MAX_ROWS } from '../runtime/constants';
import {
	applyConditions,
	applyOrderBy,
	validateOrderByField,
	validatePlanFields,
} from './vault-query-condition';
import { applySelection, getDataset } from './vault-query-datasets';
import { parseQueryPlan } from './vault-query-parser';
import type { VaultQueryDataSource } from './vault-query-types';

export async function executeVaultQuery(
	app: App,
	expression: string
): Promise<{
	columns: string[];
	rows: Array<Record<string, unknown>>;
	meta: {
		dataSource: VaultQueryDataSource;
		totalBeforeLimit: number;
		returned: number;
		limit: number;
		offset: number;
		truncated: boolean;
	};
}> {
	const plan = parseQueryPlan(expression);
	const dataset = await getDataset(app, plan.from);
	const allowedFields = new Set<string>(dataset.fields);
	validatePlanFields(plan, allowedFields);

	const filteredRows = applyConditions(dataset.rows, plan);
	const selectedRows = applySelection(filteredRows, plan);
	const columns = plan.select.map((item) => item.alias);
	validateOrderByField(plan.orderBy, columns, selectedRows);
	const orderedRows = applyOrderBy(selectedRows, plan.orderBy);

	const offset = plan.offset ?? 0;
	const limit = plan.limit ?? DEFAULT_QUERY_MAX_ROWS;
	const pagedRows = orderedRows.slice(offset, offset + limit);
	const totalBeforeLimit = orderedRows.length;

	return {
		columns,
		rows: pagedRows,
		meta: {
			dataSource: plan.from,
			totalBeforeLimit,
			returned: pagedRows.length,
			limit,
			offset,
			truncated: offset + pagedRows.length < totalBeforeLimit,
		},
	};
}
