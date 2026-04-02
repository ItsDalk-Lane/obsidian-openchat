import type { BuiltinValidationResult } from '../../runtime/types';
import { validateIanaTimezone } from '../time-utils';
import { executeGetCurrentTime } from '../get-time/service';
import type { RegisterTimeToolsOptions } from '../get-time/tool';
import type { GetCurrentTimeArgs } from './schema';

export const validateGetCurrentTimeInput = (
	args: GetCurrentTimeArgs,
): BuiltinValidationResult => {
	try {
		if (args.timezone) {
			validateIanaTimezone(args.timezone);
		}
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
		};
	}
};

export const summarizeGetCurrentTime = (
	args: Partial<GetCurrentTimeArgs>,
): string | null => args.timezone ?? 'current';

export const executeGetCurrentTimeTool = (
	args: GetCurrentTimeArgs,
	options: RegisterTimeToolsOptions,
) => executeGetCurrentTime(args.timezone, options.defaultTimezone);
