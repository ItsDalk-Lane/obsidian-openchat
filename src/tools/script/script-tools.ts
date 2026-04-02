import { App, FileSystemAdapter, Platform } from 'obsidian';
import { z } from 'zod';
import {
	DEFAULT_SHELL_MAX_BUFFER,
	DEFAULT_SHELL_TIMEOUT_MS,
} from '../runtime/constants';
import { ScriptRuntime } from '../runtime/script-runtime';
import type { BuiltinTool } from '../runtime/types';
import { normalizeVaultPath } from '../vault/helpers';

const executeScriptSchema = z.object({
	script: z
		.string()
		.min(1)
		.max(12_000)
		.describe('要执行的受限 JavaScript 脚本代码。脚本中只可使用 call_tool(name, args) 调用其他工具，以及 moment() 处理时间；最大 12000 字符。'),
}).strict();

const callShellSchema = z.object({
	command: z
		.string()
		.min(1)
		.max(4_000)
		.describe('要执行的本机 shell 命令文本。适用于需要直接调用操作系统命令、脚本或外部程序的场景。'),
	cwd: z
		.string()
		.optional()
		.describe('命令工作目录。可传绝对路径，或传相对于 Vault 根目录的路径；省略时默认使用 Vault 根目录。'),
}).strict();

const callShellResultSchema = z.object({
	supported: z.boolean(),
	cwd: z.string(),
	stdout: z.string(),
	stderr: z.string(),
	exitCode: z.number().int(),
	timedOut: z.boolean(),
});

const resolveVaultBasePath = (app: App): string | null => {
	const adapter = app.vault.adapter;
	if (adapter instanceof FileSystemAdapter) {
		return adapter.getBasePath();
	}

	const maybeAdapter = adapter as unknown as {
		getBasePath?: () => string;
	};
	if (typeof maybeAdapter.getBasePath === 'function') {
		return maybeAdapter.getBasePath();
	}
	return null;
};

const resolveCwd = (basePath: string, cwd?: string): string => {
	const raw = String(cwd ?? '').trim();
	if (!raw) return basePath;
	if (raw.startsWith('/') || raw.match(/^[a-zA-Z]:\\/)) {
		return raw;
	}
	const relative = normalizeVaultPath(raw);
	if (!relative) return basePath;
	return `${basePath}/${relative}`;
};

export function createScriptTools(
	app: App,
	scriptRuntime: ScriptRuntime
): BuiltinTool[] {
	return [{
		name: 'run_script',
			title: '执行受限脚本',
			description: `在受限脚本运行时中执行 JavaScript，用于多步工具编排、条件判断和结果拼装。

## 何时使用

- 需要连续调用多个工具，并根据中间结果决定后续步骤时
- 需要把多个工具结果整合成一个返回值时
- 需要用条件逻辑控制工具调用流程时

## 何时不使用

- **不要用于执行本机命令**：需要调用 OS/CLI 时请使用 \`run_shell\`
- **不要用于直接读写操作系统文件**：请使用对应文件工具
- **不要用于只调用单个工具**：直接调用目标工具即可

## 可用字段

- **script**（必需）：要执行的 JavaScript 代码，最大 12000 字符；脚本内只可使用 \`call_tool(name, args)\` 和 \`moment()\`

## 返回值

返回脚本执行结果。通常是最后 \`return\` 的值，或脚本中调用工具后组合出的对象或文本。

## 失败恢复

- 如果需要执行本机命令，改用 \`run_shell\`
- 如果只是想调用单个工具，直接调用该工具，不要重试 \`run_script\`
- 如果是脚本语法错误，先修正为合法 JavaScript 再重试

## 示例

\`\`\`json
{
	"script": "const result = await call_tool('get_current_time', { timezone: 'Asia/Shanghai' }); return result.timezone;"
}
\`\`\``,
			inputSchema: executeScriptSchema,
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: false,
				openWorldHint: false,
			},
		async execute({ script }) {
			return await scriptRuntime.execute(script);
		},
	}, {
		name: 'run_shell',
			title: '执行本机 Shell',
			description: `执行本机 shell 命令，仅在桌面端环境中可用。

## 何时使用

- 确实需要调用操作系统命令、脚本文件或外部程序时
- 现有内置工具无法满足需求，必须下沉到 CLI 时

## 何时不使用

- **不要用于工具编排或条件分支**：这类逻辑请使用 \`run_script\`
- **不要把它当作文件读取抽象**：Vault 内文件请优先使用文件系统工具
- **不要在平台不支持时反复重试**：移动端或非桌面环境可能直接不可用

## 可用字段

- **command**（必需）：要执行的 shell 命令
- **cwd**（可选）：工作目录。可传绝对路径，或传相对于 Vault 根目录的路径；默认是 Vault 根目录

## 返回值

返回 \`supported\`、\`cwd\`、\`stdout\`、\`stderr\`、\`exitCode\`、\`timedOut\`，用于判断命令是否执行、输出了什么以及是否超时。

## 失败恢复

- 如果只是想让多个工具协作，改用 \`run_script\`
- 如果返回 \`supported=false\`，确认当前是否为桌面端环境
- 如果命令执行失败，先检查 \`stderr\`、\`exitCode\` 和 \`cwd\`

## 示例

\`\`\`json
{
  "command": "ls -la",
  "cwd": "scripts"
}
\`\`\``,
			inputSchema: callShellSchema,
			outputSchema: callShellResultSchema,
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: false,
				openWorldHint: true,
			},
		async execute({ command, cwd }) {
			if (!Platform.isDesktopApp && !Platform.isDesktop) {
				return {
					supported: false,
					cwd: '',
					stdout: '',
					stderr: '',
					exitCode: -1,
					timedOut: false,
				};
			}

			const basePath = resolveVaultBasePath(app);
			if (!basePath) {
				throw new Error('无法获取 Vault 根目录绝对路径');
			}
			const resolvedCwd = resolveCwd(basePath, cwd);

			const { exec } =
				// eslint-disable-next-line @typescript-eslint/no-var-requires
				(require('child_process') as typeof import('child_process'));

			return await new Promise<{
				supported: boolean;
				cwd: string;
				stdout: string;
				stderr: string;
				exitCode: number;
				timedOut: boolean;
			}>((resolve) => {
				exec(
					command,
					{
						cwd: resolvedCwd,
						timeout: DEFAULT_SHELL_TIMEOUT_MS,
						maxBuffer: DEFAULT_SHELL_MAX_BUFFER,
					},
					(error, stdout, stderr) => {
						resolve({
							supported: true,
							cwd: resolvedCwd,
							stdout: stdout ?? '',
							stderr: stderr ?? '',
							exitCode:
								error && typeof error.code === 'number'
									? error.code
									: 0,
							timedOut: Boolean(
								error
								&& typeof error === 'object'
								&& 'killed' in error
								&& (error as { killed?: boolean }).killed
							),
						});
					}
				);
			});
		},
	}];
}
