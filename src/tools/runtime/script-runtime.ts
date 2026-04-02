import { DEFAULT_SCRIPT_TIMEOUT_MS } from './constants';

type AsyncFunctionType = new (
	...args: string[]
) => (...fnArgs: unknown[]) => Promise<unknown>;

const AsyncFunctionCtor = Object.getPrototypeOf(
	async function () {
		// noop
	}
).constructor as AsyncFunctionType;

const blockedPatterns: RegExp[] = [
	/\brequire\s*\(/i,
	/\bimport\s+/i,
	/\bprocess\b/i,
	/\bglobalThis\b/i,
	/\bwindow\b/i,
	/\bdocument\b/i,
	/\bFunction\s*\(/i,
	/\beval\s*\(/i,
	/\bXMLHttpRequest\b/i,
	/\bfetch\s*\(/i,
	/\bWebSocket\b/i,
	/\bwhile\s*\(\s*true\s*\)/i,
	/\bfor\s*\(\s*;\s*;\s*\)/i,
];

export interface ScriptRuntimeDependencies {
	callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
	momentFactory: (...args: unknown[]) => unknown;
}

export interface ScriptToolCallEvent {
	readonly toolName: string;
	readonly args: Record<string, unknown>;
	readonly callIndex: number;
}

export interface ScriptExecutionOptions {
	readonly timeoutMs?: number;
	readonly abortSignal?: AbortSignal;
	readonly onToolCall?: (event: ScriptToolCallEvent) => void;
}

interface ActiveRun {
	timer: ReturnType<typeof setTimeout>;
	reject: (error: Error) => void;
	disposeAbort?: () => void;
}

export class ScriptRuntime {
	private readonly activeRuns = new Map<number, ActiveRun>();
	private nextRunId = 1;
	private disposed = false;

	constructor(
		private readonly dependencies: ScriptRuntimeDependencies,
		private readonly defaultTimeoutMs = DEFAULT_SCRIPT_TIMEOUT_MS
	) {}

	private assertNotDisposed(): void {
		if (this.disposed) {
			throw new Error('脚本运行时已关闭');
		}
	}

	validateScriptSource(script: string): void {
		const source = String(script ?? '').trim();
		if (!source) {
			throw new Error('script 不能为空');
		}

		for (const pattern of blockedPatterns) {
			if (pattern.test(source)) {
				throw new Error(`脚本包含不允许的语法: ${pattern}`);
			}
		}
	}

	private normalizeExecuteOptions(
		options?: number | ScriptExecutionOptions,
	): ScriptExecutionOptions {
		return typeof options === 'number'
			? { timeoutMs: options }
			: (options ?? {});
	}

	private assertNotAborted(signal?: AbortSignal): void {
		if (signal?.aborted) {
			throw new Error('脚本执行已取消');
		}
	}

	async execute(
		script: string,
		options?: number | ScriptExecutionOptions,
	): Promise<unknown> {
		this.assertNotDisposed();
		this.validateScriptSource(script);
		const executionOptions = this.normalizeExecuteOptions(options);
		this.assertNotAborted(executionOptions.abortSignal);

		const timeout = Number.isFinite(executionOptions.timeoutMs)
			? Math.max(1, Number(executionOptions.timeoutMs))
			: this.defaultTimeoutMs;
		const runId = this.nextRunId++;

		return await new Promise<unknown>((resolve, reject) => {
			let settled = false;
			const complete = (handler: () => void): void => {
				if (settled) return;
				settled = true;
				const active = this.activeRuns.get(runId);
				if (active) {
					clearTimeout(active.timer);
					active.disposeAbort?.();
					this.activeRuns.delete(runId);
				}
				handler();
			};

			const timer = setTimeout(() => {
				complete(() => reject(new Error(`脚本执行超时 (${timeout}ms)`)));
			}, timeout);

			const onAbort = (): void => {
				complete(() => reject(new Error('脚本执行已取消')));
			};
			const abortSignal = executionOptions.abortSignal;
			const disposeAbort = abortSignal
				? (() => {
					abortSignal.addEventListener('abort', onAbort, { once: true });
					return () => abortSignal.removeEventListener('abort', onAbort);
				})()
				: undefined;

			this.activeRuns.set(runId, {
				timer,
				disposeAbort,
				reject: (error: Error) => complete(() => reject(error)),
			});

			let toolCallIndex = 0;
			const callTool = async (
				name: string,
				args: Record<string, unknown> = {}
			): Promise<unknown> => {
				this.assertNotDisposed();
				this.assertNotAborted(abortSignal);
				const toolName = String(name ?? '').trim();
				if (!toolName) {
					throw new Error('call_tool 的 name 不能为空');
				}
				toolCallIndex += 1;
				executionOptions.onToolCall?.({
					toolName,
					args: args ?? {},
					callIndex: toolCallIndex,
				});
				return await this.dependencies.callTool(toolName, args ?? {});
			};

			const moment = (...args: unknown[]): unknown => {
				return this.dependencies.momentFactory(...args);
			};

			try {
				const fn = new AsyncFunctionCtor('call_tool', 'moment', script);
				Promise.resolve(fn(callTool, moment))
					.then((result) => complete(() => resolve(result)))
					.catch((error: unknown) => {
						const message =
							error instanceof Error ? error.message : String(error);
						complete(() => reject(new Error(message)));
					});
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				complete(() => reject(new Error(message)));
			}
		});
	}

	reset(): void {
		this.disposed = true;
		for (const [runId, active] of this.activeRuns) {
			clearTimeout(active.timer);
			active.reject(new Error('脚本运行时已停止'));
			this.activeRuns.delete(runId);
		}
	}
}
