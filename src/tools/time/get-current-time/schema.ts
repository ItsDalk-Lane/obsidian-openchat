import { z } from 'zod';
import {
	timeAnnotations,
	timeResultSchema,
} from '../get-time/schema';

export const getCurrentTimeSchema = z.object({
	timezone: z
		.string()
		.min(1)
		.optional()
		.describe("可选 IANA 时区名称，例如 'Asia/Shanghai'；不传时使用默认时区"),
}).strict();

export type GetCurrentTimeArgs = z.infer<typeof getCurrentTimeSchema>;

export {
	timeAnnotations,
	timeResultSchema as getCurrentTimeResultSchema,
};
