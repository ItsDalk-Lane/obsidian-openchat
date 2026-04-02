import { z } from 'zod';

export const runScriptSchema = z.object({
	script: z
		.string()
		.min(1)
		.max(12_000)
		.describe(
			'要执行的受限 JavaScript 脚本代码。脚本中只可使用 call_tool(name, args) 调用其他工具，以及 moment() 处理时间；最大 12000 字符。',
		),
}).strict();

export type RunScriptArgs = z.infer<typeof runScriptSchema>;

export const runScriptAnnotations = {
	readOnlyHint: false,
	destructiveHint: true,
	idempotentHint: false,
	openWorldHint: false,
} as const;
