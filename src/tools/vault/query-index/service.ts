import type { App } from 'obsidian';
import { toCanonicalJsonText } from '../../runtime/tool-result';
import type { BuiltinValidationResult } from '../../runtime/types';
import { asStructuredOrText } from '../_shared/result';
import { parseQueryIndexArgs } from '../filesystemToolParsers';
import { toQueryIndexResponse } from '../filesystemFileOps';
import { buildQueryIndexExpression } from '../filesystemQueryIndex';
import { executeVaultQuery } from '../vault-query';
import type { QueryIndexArgs } from './schema';

export const validateQueryIndexInput = (
	args: QueryIndexArgs,
): BuiltinValidationResult => {
	try {
		const parsedArgs = parseQueryIndexArgs(args);
		buildQueryIndexExpression(parsedArgs);
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
			notes: ['query_index 只查询结构化元数据，不会读取文件正文内容。'],
		};
	}
};

export const executeQueryIndex = async (
	app: App,
	args: QueryIndexArgs,
): Promise<unknown> => {
	const parsedArgs = parseQueryIndexArgs(args);
	const expression = buildQueryIndexExpression(parsedArgs);
	const result = toQueryIndexResponse(await executeVaultQuery(app, expression));
	return asStructuredOrText(
		parsedArgs.response_format ?? 'json',
		result,
		(structured) => toCanonicalJsonText(structured),
	);
};