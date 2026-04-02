import { z } from 'zod';

export const runShellSchema = z.object({
	command: z
		.string()
		.min(1)
		.max(4_000)
		.describe(
			'要执行的本机 shell 命令文本。适用于需要直接调用操作系统命令、脚本或外部程序的场景。',
		),
	cwd: z
		.string()
		.optional()
		.describe(
			'命令工作目录。可传绝对路径，或传相对于 Vault 根目录的路径；省略时默认使用 Vault 根目录。',
		),
}).strict();

export const runShellResultSchema = z.object({
	supported: z.boolean(),
	cwd: z.string(),
	stdout: z.string(),
	stderr: z.string(),
	exitCode: z.number().int(),
	timedOut: z.boolean(),
});

export type RunShellArgs = z.infer<typeof runShellSchema>;
export type RunShellResult = z.infer<typeof runShellResultSchema>;

export const runShellAnnotations = {
	readOnlyHint: false,
	destructiveHint: true,
	idempotentHint: false,
	openWorldHint: true,
} as const;
