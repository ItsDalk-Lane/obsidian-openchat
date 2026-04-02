import type { App, FileSystemAdapter } from 'obsidian';
import { Platform } from 'obsidian';
import {
	DEFAULT_SHELL_MAX_BUFFER,
	DEFAULT_SHELL_TIMEOUT_MS,
} from '../../runtime/constants';
import type {
	BuiltinPermissionDecision,
	BuiltinToolExecutionContext,
	BuiltinValidationResult,
} from '../../runtime/types';
import { normalizeVaultPath } from '../../vault/helpers';
import type { RunShellArgs, RunShellResult } from './schema';

type ShellRisk = 'read-only' | 'mutating' | 'destructive' | 'unknown';

const SHELL_SUMMARY_LIMIT = 96;
const ABSOLUTE_PATH_PATTERN = /^(\/|[a-zA-Z]:\\)/u;
const READ_ONLY_COMMAND_PATTERNS = [
	/^\s*(pwd|whoami|uname)\b/iu,
	/^\s*(ls|dir|cat|head|tail|rg|grep|find|which|where)\b/iu,
	/^\s*echo\b/iu,
] as const;
const MUTATING_COMMAND_PATTERNS = [
	/\b(mkdir|touch|cp|tee)\b/iu,
	/\b(npm|pnpm|yarn)\s+(install|add|remove|uninstall|update)\b/iu,
	/\bgit\s+(add|commit|pull|push|merge|rebase|checkout|switch)\b/iu,
] as const;
const DESTRUCTIVE_COMMAND_PATTERNS = [
	/\brm\s+-[^\n]*r/iu,
	/\b(del|erase|rmdir)\b/iu,
	/\b(mv|move|rename|ren)\b/iu,
	/\b(chmod|chown|truncate)\b/iu,
	/\bgit\s+(clean|reset)\b/iu,
	/>+/u,
] as const;

const isDesktopShellSupported = (): boolean => {
	return Platform.isDesktopApp || Platform.isDesktop;
};

const collapseCommand = (command?: string): string => {
	return String(command ?? '').replace(/\s+/gu, ' ').trim();
};

export const summarizeRunShell = (
	args: Partial<RunShellArgs>,
): string | null => {
	const command = collapseCommand(args.command);
	if (!command) {
		return null;
	}
	const summary = command.length <= SHELL_SUMMARY_LIMIT
		? command
		: `${command.slice(0, SHELL_SUMMARY_LIMIT - 3)}...`;
	return args.cwd ? `${summary} @ ${args.cwd}` : summary;
};

const hasParentTraversal = (input: string): boolean => {
	return input.split(/[\\/]+/u).some((segment) => segment === '..');
};

const normalizeRunShellCwd = (cwd?: string): string | undefined => {
	const raw = String(cwd ?? '').trim();
	if (!raw) {
		return undefined;
	}
	if (ABSOLUTE_PATH_PATTERN.test(raw)) {
		return raw;
	}
	if (hasParentTraversal(raw)) {
		throw new Error('cwd 不能包含 ..');
	}
	return normalizeVaultPath(raw);
};

const normalizeRunShellArgs = (args: RunShellArgs): RunShellArgs => {
	const command = collapseCommand(args.command);
	if (!command) {
		throw new Error('command 不能为空');
	}
	const cwd = normalizeRunShellCwd(args.cwd);
	return {
		command,
		...(cwd ? { cwd } : {}),
	};
};

const matchesAny = (command: string, patterns: readonly RegExp[]): boolean => {
	return patterns.some((pattern) => pattern.test(command));
};

export const resolveRunShellRisk = (command: string): ShellRisk => {
	if (matchesAny(command, DESTRUCTIVE_COMMAND_PATTERNS)) {
		return 'destructive';
	}
	if (matchesAny(command, MUTATING_COMMAND_PATTERNS)) {
		return 'mutating';
	}
	if (matchesAny(command, READ_ONLY_COMMAND_PATTERNS)) {
		return 'read-only';
	}
	return 'unknown';
};

const buildConfirmationBody = (
	args: RunShellArgs,
	risk: ShellRisk,
): string => {
	const lines = [`命令: ${args.command}`];
	if (args.cwd) {
		lines.push(`工作目录: ${args.cwd}`);
	}
	lines.push(`动态风险: ${risk}`);
	return lines.join('\n');
};

export const validateRunShellInput = (
	args: RunShellArgs,
): BuiltinValidationResult => {
	try {
		normalizeRunShellArgs(args);
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
			notes: ['cwd 只接受绝对路径或 Vault 根目录下的相对路径。'],
		};
	}
};

export const checkRunShellPermissions = async (
	_argsApp: App,
	args: RunShellArgs,
): Promise<BuiltinPermissionDecision<RunShellArgs>> => {
	const normalizedArgs = normalizeRunShellArgs(args);
	if (!isDesktopShellSupported()) {
		return {
			behavior: 'allow',
			updatedArgs: normalizedArgs,
			notes: ['当前环境不支持桌面 shell 执行，run_shell 将返回 supported=false。'],
		};
	}

	const risk = resolveRunShellRisk(normalizedArgs.command);
	const title = risk === 'destructive'
		? '确认执行高风险 shell 命令'
		: '确认执行 shell 命令';
	const message = risk === 'destructive'
		? '即将执行高风险 shell 命令'
		: risk === 'read-only'
			? '即将执行只读 shell 命令'
			: '即将执行 shell 命令';

	return {
		behavior: 'ask',
		message,
		updatedArgs: normalizedArgs,
		escalatedRisk: risk === 'unknown' ? 'escape-hatch' : risk,
		confirmation: {
			title,
			body: buildConfirmationBody(normalizedArgs, risk),
			confirmLabel: risk === 'read-only' ? '继续执行' : '确认执行',
		},
	};
};

const resolveVaultBasePath = (app: App): string | null => {
	const adapter = app.vault.adapter;
	if (adapter instanceof (Object.getPrototypeOf(adapter).constructor as typeof FileSystemAdapter)) {
		return (adapter as FileSystemAdapter).getBasePath();
	}
	const maybeAdapter = adapter as unknown as { getBasePath?: () => string };
	return typeof maybeAdapter.getBasePath === 'function'
		? maybeAdapter.getBasePath()
		: null;
};

const resolveRunShellCwd = (
	basePath: string,
	cwd?: string,
): string => {
	const normalized = normalizeRunShellCwd(cwd);
	if (!normalized) {
		return basePath;
	}
	return ABSOLUTE_PATH_PATTERN.test(normalized)
		? normalized
		: `${basePath}/${normalized}`;
};

const buildRunShellResult = (
	cwd: string,
	stdout: string,
	stderr: string,
	error: unknown,
	aborted: boolean,
): RunShellResult => {
	const exitCode = error && typeof error === 'object' && 'code' in error
		&& typeof (error as { code?: unknown }).code === 'number'
		? (error as { code: number }).code
		: aborted
			? -1
			: 0;
	const timedOut = Boolean(
		!aborted
		&& error
		&& typeof error === 'object'
		&& 'killed' in error
		&& (error as { killed?: boolean }).killed,
	);
	return {
		supported: true,
		cwd,
		stdout: stdout ?? '',
		stderr: aborted ? (stderr || '命令执行已取消') : (stderr ?? ''),
		exitCode,
		timedOut,
	};
};

export const executeRunShell = async (
	app: App,
	args: RunShellArgs,
	context: BuiltinToolExecutionContext<unknown>,
): Promise<RunShellResult> => {
	if (!isDesktopShellSupported()) {
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

	const normalizedArgs = normalizeRunShellArgs(args);
	const resolvedCwd = resolveRunShellCwd(basePath, normalizedArgs.cwd);
	const risk = resolveRunShellRisk(normalizedArgs.command);
	context.reportProgress?.({
		message: `执行 shell 命令 ${summarizeRunShell(normalizedArgs) ?? ''}`.trim(),
		progress: {
			risk,
			cwd: resolvedCwd,
		},
	});

	const { exec } =
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		(require('child_process') as typeof import('child_process'));

	return await new Promise<RunShellResult>((resolve) => {
		exec(
			normalizedArgs.command,
			{
				cwd: resolvedCwd,
				timeout: DEFAULT_SHELL_TIMEOUT_MS,
				maxBuffer: DEFAULT_SHELL_MAX_BUFFER,
				signal: context.abortSignal,
			},
			(error, stdout, stderr) => {
				const aborted = context.abortSignal?.aborted === true
					|| (
						error instanceof Error
						&& error.name === 'AbortError'
					);
				resolve(buildRunShellResult(resolvedCwd, stdout ?? '', stderr ?? '', error, aborted));
			},
		);
	});
};
