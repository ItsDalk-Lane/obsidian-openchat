import { z } from 'zod';
import {
	calculateTimeRangeResultSchema,
	timeAnnotations,
	type CalculateTimeRangeResult,
} from '../get-time/schema';

export const calculateTimeRangeSchema = z.object({
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

export type CalculateTimeRangeArgs = z.infer<typeof calculateTimeRangeSchema>;
export type { CalculateTimeRangeResult };

export {
	calculateTimeRangeResultSchema,
	timeAnnotations,
};
