import type { BuiltinToolExecutionContext } from '../../runtime/types';
import {
	describeFetchActivity,
	executeFetchBatchTargets,
	summarizeFetchTarget,
} from '../fetch/service';
import type { FetchToolsOptions } from './schema';
import type { FetchWebpagesBatchArgs } from './schema';

export const summarizeFetchWebpagesBatchTarget = (
	args: Partial<FetchWebpagesBatchArgs>,
): string | null => summarizeFetchTarget(args);

export const describeFetchWebpagesBatchActivity = (
	args: Partial<FetchWebpagesBatchArgs>,
): string | null => describeFetchActivity(args);

export const executeFetchWebpagesBatch = async (
	args: FetchWebpagesBatchArgs,
	context: BuiltinToolExecutionContext<unknown>,
	options: FetchToolsOptions = {},
): Promise<string> => {
	return await executeFetchBatchTargets(args, context, options);
};
