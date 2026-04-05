import type { App } from 'obsidian';
import type {
	ToolRepairHint,
	ToolRiskLevel,
	ToolRuntimePolicy,
	ToolValidationIssue,
} from 'src/types/tool';
import type { McpToolAnnotations } from 'src/services/mcp/types';
import { z } from 'zod';

export interface ToolContext {
	readonly app: App;
	readonly callTool: (
		name: string,
		args: Record<string, unknown>
	) => Promise<unknown>;
}

export interface BuiltinToolSelectedTextContext {
	readonly filePath?: string | null;
	readonly startLine?: number;
	readonly endLine?: number;
}

export interface BuiltinToolProgressEvent<TProgress = never> {
	readonly message?: string;
	readonly progress?: TProgress;
}

export interface BuiltinToolConfirmationRequest {
	readonly title: string;
	readonly body?: string;
	readonly confirmLabel?: string;
}

export interface BuiltinToolConfirmationResponse {
	readonly decision: 'allow' | 'deny';
}

export interface BuiltinToolUserInputOption {
	readonly label: string;
	readonly value: string;
	readonly description?: string;
}

export interface BuiltinToolUserInputRequest {
	readonly question: string;
	readonly options?: readonly BuiltinToolUserInputOption[];
	readonly allowFreeText?: boolean;
}

export type BuiltinToolUserInputResponse =
	| {
		readonly outcome: 'selected';
		readonly selectedValue: string;
	}
	| {
		readonly outcome: 'free-text';
		readonly freeText: string;
	}
	| {
		readonly outcome: 'cancelled';
	};

export interface BuiltinToolExecutionContext<TProgress = never> extends ToolContext {
	readonly abortSignal?: AbortSignal;
	readonly activeFilePath?: string | null;
	readonly selectedTextContext?: BuiltinToolSelectedTextContext | null;
	readonly reportProgress?: (
		event: BuiltinToolProgressEvent<TProgress>
	) => void;
	readonly requestConfirmation?: (
		request: BuiltinToolConfirmationRequest
	) => Promise<BuiltinToolConfirmationResponse>;
	readonly requestUserInput?: (
		request: BuiltinToolUserInputRequest
	) => Promise<BuiltinToolUserInputResponse>;
}

export class BuiltinToolUserInputError extends Error {
	constructor(
		message: string,
		readonly code: 'unavailable' | 'cancelled',
	) {
		super(message);
		this.name = 'BuiltinToolUserInputError';
	}
}

export type BuiltinValidationResult =
	| { ok: true }
	| {
		ok: false;
		summary: string;
		issues?: readonly ToolValidationIssue[];
		repairHints?: readonly ToolRepairHint[];
		notes?: readonly string[];
	};

export type BuiltinPermissionDecision<TArgs> =
	| {
		behavior: 'allow';
		updatedArgs?: TArgs;
		notes?: readonly string[];
	}
	| {
		behavior: 'deny';
		message: string;
		escalatedRisk?: ToolRiskLevel;
	}
	| {
		behavior: 'ask';
		message: string;
		updatedArgs?: TArgs;
		escalatedRisk?: ToolRiskLevel;
		confirmation?: BuiltinToolConfirmationRequest;
	};

export type BuiltinToolInterruptBehavior = 'cancel' | 'block';

export type BuiltinToolRuntimePolicy = ToolRuntimePolicy;

export type BuiltinToolSurfaceSpec = Record<string, unknown>;

export interface BuiltinTool<TArgs = unknown, TResult = unknown, TProgress = never> {
	readonly name: string;
	readonly title?: string;
	readonly aliases?: readonly string[];
	readonly description: string;
	readonly prompt?: string;
	readonly inputSchema: z.ZodTypeAny;
	readonly outputSchema?: z.ZodTypeAny;
	readonly annotations?: McpToolAnnotations;
	readonly surface?: BuiltinToolSurfaceSpec;
	readonly runtimePolicy?: BuiltinToolRuntimePolicy;
	isEnabled?(): boolean;
	isReadOnly?(args: TArgs): boolean;
	isDestructive?(args: TArgs): boolean;
	isConcurrencySafe?(args: TArgs): boolean;
	interruptBehavior?(args: TArgs): BuiltinToolInterruptBehavior;
	toClassifierInput?(args: TArgs): unknown;
	validateInput?(
		args: TArgs,
		context: BuiltinToolExecutionContext<TProgress>
	): Promise<BuiltinValidationResult> | BuiltinValidationResult;
	checkPermissions?(
		args: TArgs,
		context: BuiltinToolExecutionContext<TProgress>
	): Promise<BuiltinPermissionDecision<TArgs>> | BuiltinPermissionDecision<TArgs>;
	getToolUseSummary?(args: Partial<TArgs>): string | null;
	getActivityDescription?(args: Partial<TArgs>): string | null;
	serializeResult?(
		result: TResult,
		context: BuiltinToolExecutionContext<TProgress>
	): unknown;
	extractSearchText?(result: TResult): string;
	execute(
		args: TArgs,
		context: BuiltinToolExecutionContext<TProgress>
	): Promise<TResult> | TResult;
}
