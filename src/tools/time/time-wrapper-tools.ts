import { z } from 'zod';
import type { BuiltinTool } from '../runtime/types';
import {
	buildCurrentTimeResult,
	buildTimeConversionResult,
	buildTimeRangeResult,
} from './time-utils';
import type { RegisterTimeToolsOptions } from './time-tools';
import { timeResultSchema } from './time-tools';

const getCurrentTimeSchema = z.object({
	timezone: z
		.string()
		.min(1)
		.optional()
		.describe("可选 IANA 时区名称，例如 'Asia/Shanghai'；不传时使用默认时区"),
}).strict();

const convertTimeSchema = z.object({
	source_timezone: z
		.string()
		.min(1)
		.describe("源 IANA 时区名称，例如 'Asia/Shanghai'"),
	target_timezone: z
		.string()
		.min(1)
		.describe("目标 IANA 时区名称，例如 'Europe/London'"),
	time: z
		.string()
		.min(1)
		.describe('要转换的时间，24 小时制 HH:MM'),
}).strict();

const calculateTimeRangeSchema = z.object({
	natural_time: z
		.string()
		.min(1)
		.describe("自然语言时间表达，支持中文和英文，例如 '上周'、'昨天'、'past 3 days'"),
	timezone: z
		.string()
		.min(1)
		.optional()
		.describe("可选 IANA 时区名称，例如 'Asia/Shanghai'；不传时使用默认时区"),
}).strict();

const convertTimeResultSchema = z.object({
	source: timeResultSchema,
	target: timeResultSchema,
	time_difference: z.string(),
});

const calculateTimeRangeResultSchema = z.object({
	start: z.number().int(),
	end: z.number().int(),
	start_datetime: z.string(),
	end_datetime: z.string(),
	timezone: z.string(),
	parsed_expression: z.string(),
});

export function createTimeWrapperTools(
	options: RegisterTimeToolsOptions,
): BuiltinTool[] {
	return [
		{
			name: 'get_current_time',
			title: '获取当前时间',
			description: '获取某个时区的当前时间。',
			inputSchema: getCurrentTimeSchema,
			outputSchema: timeResultSchema,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
			execute(args: z.infer<typeof getCurrentTimeSchema>) {
				return buildCurrentTimeResult(args.timezone ?? options.defaultTimezone);
			},
		},
		{
			name: 'convert_time',
			title: '转换时间',
			description: '把一个时间从源时区换算到目标时区。',
			inputSchema: convertTimeSchema,
			outputSchema: convertTimeResultSchema,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
			execute(args: z.infer<typeof convertTimeSchema>) {
				return buildTimeConversionResult(
					args.source_timezone,
					args.time,
					args.target_timezone,
				);
			},
		},
		{
			name: 'calculate_time_range',
			title: '计算时间范围',
			description: '把自然语言时间表达解析为时间范围。',
			inputSchema: calculateTimeRangeSchema,
			outputSchema: calculateTimeRangeResultSchema,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
			execute(args: z.infer<typeof calculateTimeRangeSchema>) {
				return buildTimeRangeResult(
					args.natural_time,
					args.timezone,
					options.defaultTimezone,
				);
			},
		},
	];
}