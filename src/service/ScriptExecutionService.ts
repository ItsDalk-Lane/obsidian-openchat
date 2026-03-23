import type { App } from "obsidian";
import * as vm from "vm";
import { localInstance } from "src/i18n/locals";

export type ScriptSource = "snippet" | "form-inline" | "form-expression";

export interface ScriptExecutionOptions {
    script?: string;
    code?: string;
    expression?: string;
    args?: Record<string, any>;
    timeout?: number;
    source?: ScriptSource;
    context?: Record<string, any>;
}

export interface ScriptExecutionResult {
    success: boolean;
    stdout?: string;
    stderr?: string;
    returnValue?: any;
    duration: number;
    error?: string;
}

export class ScriptExecutionService {
    constructor(private readonly app?: App) {}

    async executeScript(options: ScriptExecutionOptions): Promise<ScriptExecutionResult> {
        const source = options.source ?? "snippet";
        if (source !== "snippet") {
            return this.createLegacySourceRemovedResult(source);
        }
        return await this.executeSnippet(options);
    }

    private async executeSnippet(options: ScriptExecutionOptions): Promise<ScriptExecutionResult> {
        const code = String(options.script ?? options.code ?? "");
        const timeout = Number.isFinite(options.timeout) ? Number(options.timeout) : 5000;
        const scriptArgs = options.args ?? {};

        if (!code.trim()) {
            return {
                success: false,
                duration: 0,
                error: "script 不能为空。请提供要执行的脚本代码或脚本名称",
            };
        }

        const outputLines: string[] = [];
        const safeConsole = {
            log: (...items: unknown[]) => outputLines.push(items.map(String).join(" ")),
            info: (...items: unknown[]) => outputLines.push(items.map(String).join(" ")),
            warn: (...items: unknown[]) => outputLines.push(items.map(String).join(" ")),
            error: (...items: unknown[]) => outputLines.push(items.map(String).join(" ")),
        };

        const sandbox = {
            console: safeConsole,
            args: scriptArgs,
        };

        const start = Date.now();
        try {
            const context = vm.createContext(sandbox);
            const wrappedCode = `"use strict";\n(() => {\n${code}\n})()`;
            const script = new vm.Script(wrappedCode);
            const resultValue = script.runInContext(context, { timeout });
            const executionTime = Date.now() - start;
            return {
                success: true,
                returnValue: resultValue,
                stdout: outputLines.join("\n"),
                duration: executionTime,
            };
        } catch (error) {
            const executionTime = Date.now() - start;
            const message = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                returnValue: null,
                stdout: outputLines.join("\n"),
                duration: executionTime,
                error: `执行失败: ${message}`,
            };
        }
    }

    private createLegacySourceRemovedResult(source: Exclude<ScriptSource, "snippet">): ScriptExecutionResult {
        return {
            success: false,
            duration: 0,
            error:
                source === "form-inline" || source === "form-expression"
                    ? "表单脚本功能已移除，无法再执行此类脚本。"
                    : localInstance.unknown_error,
        };
    }
}
