import { z } from 'zod';
import {
	convertTimeResultSchema,
	timeAnnotations,
	type ConvertTimeResult,
} from '../get-time/schema';

export const convertTimeSchema = z.object({
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

export type ConvertTimeArgs = z.infer<typeof convertTimeSchema>;
export type { ConvertTimeResult };

export {
	convertTimeResultSchema,
	timeAnnotations,
};
