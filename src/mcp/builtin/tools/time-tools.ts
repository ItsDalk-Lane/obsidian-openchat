import { z } from 'zod';
import type { BuiltinTool } from '../runtime/types';
import {
	buildCurrentTimeResult,
	buildTimeRangeResult,
	buildTimeConversionResult,
} from './time-utils';

const getTimeSchema = z
	.object({
		mode: z
			.enum(['current', 'convert', 'range'])
			.default('current')
			.describe("工具模式，'current' 获取当前时间，'convert' 转换时间，'range' 解析自然语言时间范围"),
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
			.describe("仅 range 模式可用；自然语言时间表达，支持中文和英文，例如 '上周'、'昨天'、'last week'、'past 3 days'"),
	})
	.strict();

type GetTimeArgs = z.infer<typeof getTimeSchema>;

const parseGetTimeArgs = (value: GetTimeArgs): GetTimeArgs => {
	if (value.mode === 'current') {
		for (const field of ['source_timezone', 'target_timezone', 'time', 'natural_time'] as const) {
			if (value[field] !== undefined) {
				throw new Error(`current 模式不支持参数 ${field}`);
			}
		}
		return value;
	}

	if (value.mode === 'range') {
		for (const field of ['source_timezone', 'target_timezone', 'time'] as const) {
			if (value[field] !== undefined) {
				throw new Error(`range 模式不支持参数 ${field}`);
			}
		}
		if (value.natural_time === undefined) {
			throw new Error('range 模式必须提供参数 natural_time');
		}
		return value;
	}

	for (const field of ['source_timezone', 'target_timezone', 'time'] as const) {
		if (value[field] === undefined) {
			throw new Error(`convert 模式必须提供参数 ${field}`);
		}
	}

	if (value.timezone !== undefined) {
		throw new Error('convert 模式不支持参数 timezone');
	}
	if (value.natural_time !== undefined) {
		throw new Error('convert 模式不支持参数 natural_time');
	}

	return value;
};

const timeResultSchema = z.object({
	timezone: z.string(),
	datetime: z.string(),
	day_of_week: z.string(),
	is_dst: z.boolean(),
	month: z.number().int(),
	iso_week_of_year: z.number().int(),
	iso_week_year: z.number().int(),
});

const getTimeResultSchema = z.object({
	mode: z.enum(['current', 'convert', 'range']),
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

interface RegisterTimeToolsOptions {
	defaultTimezone: string;
}

export function createTimeTools(
	options: RegisterTimeToolsOptions
): BuiltinTool[] {
	return [{
		name: 'get_time',
			title: '获取或转换时间',
			description: `获取当前时间、进行时区换算，或把自然语言时间表达解析为时间区间。

## 何时使用

- 用户询问某个时区的当前时间时
- 需要把一个时间从源时区换算到目标时区时
- 需要把“昨天”“上周”“last week”“最近7天”之类的自然语言时间表达转换为起止时间戳时
- 需要补充星期、DST、ISO 周等时间信息时

## 何时不使用

- **不要用于复杂日程规划**：它只提供取时、时区换算和常见自然语言时间范围解析
- **不要用于文件或网络操作**：请使用对应工具

## 可用字段

- **mode**（可选，默认 \`current\`）：工具模式，\`current\` 获取当前时间，\`convert\` 转换时区，\`range\` 解析自然语言时间范围
- **timezone**（可选）：\`current\` 或 \`range\` 模式使用的 IANA 时区名称
- **source_timezone**（可选）：\`convert\` 模式的源 IANA 时区名称
- **target_timezone**（可选）：\`convert\` 模式的目标 IANA 时区名称
- **time**（可选）：\`convert\` 模式要转换的时间，格式为 24 小时制 \`HH:MM\`
- **natural_time**（可选）：\`range\` 模式要解析的自然语言时间表达，支持中文和英文，例如 \`上周\`、\`昨天\`、\`last week\`、\`past 3 days\`

## 参数规则

- \`current\` 模式下只能使用 \`timezone\`
- \`convert\` 模式下必须同时提供 \`source_timezone\`、\`target_timezone\` 和 \`time\`
- \`convert\` 模式下不要传 \`timezone\`
- \`range\` 模式下必须提供 \`natural_time\`，可选传 \`timezone\`
- \`range\` 模式下不要传 \`source_timezone\`、\`target_timezone\` 或 \`time\`

## 返回值

- \`current\` 模式返回单个时区的时间信息
- \`convert\` 模式返回 \`source\`、\`target\` 和 \`time_difference\`
- \`range\` 模式返回 \`start\`（毫秒时间戳）、\`end\`（毫秒时间戳）、\`start_datetime\`（ISO 8601 可读字符串）、\`end_datetime\`（ISO 8601 可读字符串）、\`timezone\` 和 \`parsed_expression\`；**展示日期时优先使用 \`start_datetime\`/\`end_datetime\`，不要自行换算时间戳**

## 失败恢复

- 如果参数与 \`mode\` 不匹配，按模式要求修正字段
- 如果只需要当前时间，不要传 \`convert\` 专用字段
- 如果自然语言时间无法识别，请改用支持的表达方式，例如 \`上周\`、\`本月\`、\`past 7 days\`

## 示例

\`\`\`json
{
  "mode": "convert",
  "source_timezone": "Asia/Shanghai",
  "target_timezone": "Europe/London",
  "time": "09:30"
}
\`\`\`

\`\`\`json
{
  "mode": "range",
  "natural_time": "最近7天",
  "timezone": "Asia/Shanghai"
}
\`\`\``,
			inputSchema: getTimeSchema,
			outputSchema: getTimeResultSchema,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		execute(args: GetTimeArgs) {
			const {
				mode,
				timezone,
				source_timezone,
				target_timezone,
				time,
				natural_time,
			} = parseGetTimeArgs(getTimeSchema.parse(args));

			if (mode === 'convert') {
				return {
					mode,
					...buildTimeConversionResult(
						source_timezone!,
						time!,
						target_timezone!
					),
				};
			}

			if (mode === 'range') {
				return {
					mode,
					...buildTimeRangeResult(
						natural_time!,
						timezone,
						options.defaultTimezone
					),
				};
			}

			return {
				mode,
				...buildCurrentTimeResult(timezone ?? options.defaultTimezone),
			};
		},
	}];
}
