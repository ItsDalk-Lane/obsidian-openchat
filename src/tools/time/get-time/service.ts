import type { BuiltinValidationResult } from '../../runtime/types';
import {
	buildCurrentTimeResult,
	buildTimeConversionResult,
	buildTimeRangeResult,
	validateIanaTimezone,
} from '../time-utils';
import type {
	CalculateTimeRangeResult,
	ConvertTimeResult,
	GetTimeArgs,
	GetTimeMode,
	GetTimeResult,
	TimeResultPayload,
} from './schema';

const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/u;

const ensureTimezone = (timezone?: string): void => {
	if (timezone !== undefined) {
		validateIanaTimezone(timezone);
	}
};

const validateCurrentArgs = (args: GetTimeArgs): void => {
	for (const field of ['source_timezone', 'target_timezone', 'time', 'natural_time'] as const) {
		if (args[field] !== undefined) {
			throw new Error(`current 模式不支持参数 ${field}`);
		}
	}
	ensureTimezone(args.timezone);
};

const validateConvertArgs = (args: GetTimeArgs): void => {
	for (const field of ['source_timezone', 'target_timezone', 'time'] as const) {
		if (args[field] === undefined) {
			throw new Error(`convert 模式必须提供参数 ${field}`);
		}
	}
	const sourceTimezone = args.source_timezone;
	const targetTimezone = args.target_timezone;
	const time = args.time;
	if (args.timezone !== undefined) {
		throw new Error('convert 模式不支持参数 timezone');
	}
	if (args.natural_time !== undefined) {
		throw new Error('convert 模式不支持参数 natural_time');
	}
	if (!sourceTimezone || !targetTimezone || !time) {
		throw new Error('convert 模式缺少必填参数');
	}
	validateIanaTimezone(sourceTimezone);
	validateIanaTimezone(targetTimezone);
	if (!TIME_24H_REGEX.test(time)) {
		throw new Error('convert 模式的 time 必须是 24 小时制 HH:MM');
	}
};

const validateRangeArgs = (args: GetTimeArgs): void => {
	for (const field of ['source_timezone', 'target_timezone', 'time'] as const) {
		if (args[field] !== undefined) {
			throw new Error(`range 模式不支持参数 ${field}`);
		}
	}
	if (args.natural_time === undefined) {
		throw new Error('range 模式必须提供参数 natural_time');
	}
	ensureTimezone(args.timezone);
};

const validateByMode = (args: GetTimeArgs): void => {
	if (args.mode === 'current') {
		validateCurrentArgs(args);
		return;
	}
	if (args.mode === 'convert') {
		validateConvertArgs(args);
		return;
	}
	validateRangeArgs(args);
};

const summarizeMode = (mode: GetTimeMode): string => {
	if (mode === 'current') {
		return 'current';
	}
	if (mode === 'convert') {
		return 'convert';
	}
	return 'range';
};

export const summarizeGetTime = (
	args: Partial<GetTimeArgs>,
): string | null => {
	const mode = args.mode ?? 'current';
	if (mode === 'convert') {
		if (!args.source_timezone || !args.target_timezone || !args.time) {
			return 'convert';
		}
		return `${args.source_timezone} ${args.time} -> ${args.target_timezone}`;
	}
	if (mode === 'range') {
		return args.natural_time
			? `${args.natural_time}${args.timezone ? ` @ ${args.timezone}` : ''}`
			: 'range';
	}
	return args.timezone ?? 'current';
};

export const describeGetTimeActivity = (
	args: Partial<GetTimeArgs>,
): string | null => {
	const mode = summarizeMode(args.mode ?? 'current');
	return `执行时间工具 ${mode}`;
};

export const validateGetTimeInput = (
	args: GetTimeArgs,
): BuiltinValidationResult => {
	try {
		validateByMode(args);
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
			notes: ['如果是单一时间任务，优先使用更窄的时间 wrapper。'],
		};
	}
};

export const executeGetCurrentTime = (
	timezone: string | undefined,
	defaultTimezone: string,
): TimeResultPayload => {
	return buildCurrentTimeResult(timezone ?? defaultTimezone);
};

export const executeConvertTime = (
	sourceTimezone: string,
	time: string,
	targetTimezone: string,
): ConvertTimeResult => {
	return buildTimeConversionResult(sourceTimezone, time, targetTimezone);
};

export const executeCalculateTimeRange = (
	naturalTime: string,
	timezone: string | undefined,
	defaultTimezone: string,
): CalculateTimeRangeResult => {
	return buildTimeRangeResult(naturalTime, timezone, defaultTimezone);
};

export const executeGetTime = (
	args: GetTimeArgs,
	defaultTimezone: string,
): GetTimeResult => {
	if (args.mode === 'convert') {
		return {
			mode: 'convert',
			...executeConvertTime(
				args.source_timezone!,
				args.time!,
				args.target_timezone!,
			),
		};
	}
	if (args.mode === 'range') {
		return {
			mode: 'range',
			...executeCalculateTimeRange(
				args.natural_time!,
				args.timezone,
				defaultTimezone,
			),
		};
	}
	return {
		mode: 'current',
		...executeGetCurrentTime(args.timezone, defaultTimezone),
	};
};
