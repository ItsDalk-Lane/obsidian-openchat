import type { BuiltinValidationResult } from '../../runtime/types';
import {
	executeCalculateTimeRange,
} from '../get-time/service';
import { validateIanaTimezone } from '../time-utils';
import type { RegisterTimeToolsOptions } from '../get-time/tool';
import type { CalculateTimeRangeArgs } from './schema';

export const validateCalculateTimeRangeInput = (
	args: CalculateTimeRangeArgs,
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

export const summarizeCalculateTimeRange = (
	args: Partial<CalculateTimeRangeArgs>,
): string | null => {
	return args.natural_time
		? `${args.natural_time}${args.timezone ? ` @ ${args.timezone}` : ''}`
		: 'range';
};

export const executeCalculateTimeRangeTool = (
	args: CalculateTimeRangeArgs,
	options: RegisterTimeToolsOptions,
) => executeCalculateTimeRange(
	args.natural_time,
	args.timezone,
	options.defaultTimezone,
);
