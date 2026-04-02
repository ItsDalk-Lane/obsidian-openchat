import type { BuiltinValidationResult } from '../../runtime/types';
import {
	executeConvertTime,
} from '../get-time/service';
import { validateIanaTimezone } from '../time-utils';
import type { ConvertTimeArgs } from './schema';

const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/u;

export const validateConvertTimeInput = (
	args: ConvertTimeArgs,
): BuiltinValidationResult => {
	try {
		validateIanaTimezone(args.source_timezone);
		validateIanaTimezone(args.target_timezone);
		if (!TIME_24H_REGEX.test(args.time)) {
			throw new Error('time 必须是 24 小时制 HH:MM');
		}
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
		};
	}
};

export const summarizeConvertTime = (
	args: Partial<ConvertTimeArgs>,
): string | null => {
	if (!args.source_timezone || !args.target_timezone || !args.time) {
		return 'convert';
	}
	return `${args.source_timezone} ${args.time} -> ${args.target_timezone}`;
};

export const executeConvertTimeTool = (
	args: ConvertTimeArgs,
) => executeConvertTime(args.source_timezone, args.time, args.target_timezone);
