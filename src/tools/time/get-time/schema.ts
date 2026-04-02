import { z } from 'zod';

export const getTimeModeSchema = z.enum(['current', 'convert', 'range']);

export const getTimeSchema = z.object({
	mode: getTimeModeSchema
		.default('current')
		.describe(
			"工具模式，'current' 获取当前时间，'convert' 转换时间，'range' 解析自然语言时间范围",
		),
	timezone: z
		.string()
		.min(1)
		.optional()
		.describe("current 或 range 模式使用的 IANA 时区名称，例如 'Asia/Shanghai'"),
	source_timezone: z
		.string()
		.min(1)
		.optional()
		.describe("源 IANA 时区名称，例如 'America/New_York'"),
	target_timezone: z
		.string()
		.min(1)
		.optional()
		.describe("目标 IANA 时区名称，例如 'Europe/London'"),
	time: z
		.string()
		.min(1)
		.optional()
		.describe('要转换的时间，24 小时制 HH:MM'),
	natural_time: z
		.string()
		.min(1)
		.optional()
		.describe(
			"仅 range 模式可用；自然语言时间表达，支持中文和英文，例如 '上周'、'昨天'、'last week'、'past 3 days'",
		),
}).strict();

export const timeResultSchema = z.object({
	timezone: z.string(),
	datetime: z.string(),
	day_of_week: z.string(),
	is_dst: z.boolean(),
	month: z.number().int(),
	iso_week_of_year: z.number().int(),
	iso_week_year: z.number().int(),
});

export const convertTimeResultSchema = z.object({
	source: timeResultSchema,
	target: timeResultSchema,
	time_difference: z.string(),
});

export const calculateTimeRangeResultSchema = z.object({
	start: z.number().int(),
	end: z.number().int(),
	start_datetime: z.string(),
	end_datetime: z.string(),
	timezone: z.string(),
	parsed_expression: z.string(),
});

export const getTimeResultSchema = z.object({
	mode: getTimeModeSchema,
	source: timeResultSchema.optional(),
	target: timeResultSchema.optional(),
	timezone: z.string().optional(),
	datetime: z.string().optional(),
	day_of_week: z.string().optional(),
	is_dst: z.boolean().optional(),
	month: z.number().int().optional(),
	iso_week_of_year: z.number().int().optional(),
	iso_week_year: z.number().int().optional(),
	time_difference: z.string().optional(),
	start: z.number().int().optional(),
	end: z.number().int().optional(),
	start_datetime: z.string().optional(),
	end_datetime: z.string().optional(),
	parsed_expression: z.string().optional(),
});

export type GetTimeMode = z.infer<typeof getTimeModeSchema>;
export type GetTimeArgs = z.infer<typeof getTimeSchema>;
export type TimeResultPayload = z.infer<typeof timeResultSchema>;
export type GetTimeResult = z.infer<typeof getTimeResultSchema>;
export type ConvertTimeResult = z.infer<typeof convertTimeResultSchema>;
export type CalculateTimeRangeResult = z.infer<typeof calculateTimeRangeResultSchema>;

export const timeAnnotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: false,
	openWorldHint: false,
} as const;
