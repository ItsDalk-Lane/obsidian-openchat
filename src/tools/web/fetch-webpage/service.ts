import type { BuiltinToolExecutionContext } from '../../runtime/types';
import {
	describeFetchActivity,
	executeFetchSingleTarget,
	summarizeFetchTarget,
} from '../fetch/service';
import type { FetchToolsOptions } from './schema';
import type { FetchWebpageArgs } from './schema';

export const summarizeFetchWebpageTarget = (
	args: Partial<FetchWebpageArgs>,
): string | null => summarizeFetchTarget(args);

export const describeFetchWebpageActivity = (
	args: Partial<FetchWebpageArgs>,
): string | null => describeFetchActivity(args);

export const executeFetchWebpage = async (
	args: FetchWebpageArgs,
	context: BuiltinToolExecutionContext<unknown>,
	options: FetchToolsOptions = {},
): Promise<string> => {
	return await executeFetchSingleTarget(args, context, options);
};
