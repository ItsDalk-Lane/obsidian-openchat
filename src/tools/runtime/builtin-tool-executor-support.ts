import type {
	ToolCallRequest,
	ToolConfirmationRequest,
	ToolExecutionOptions,
	ToolProgressEvent,
	ToolUserInputRequest,
} from 'src/types/tool';
import type {
	BuiltinTool,
	BuiltinToolExecutionContext,
} from './types';
import { BuiltinToolUserInputError as BuiltinToolUserInputErrorClass } from './types';

export type BuiltinToolInvoker = (
	tool: BuiltinTool<unknown, unknown, unknown>,
	args: unknown,
	context: BuiltinToolExecutionContext<unknown>,
) => Promise<unknown>;

export interface BuiltinExecutionMeta {
	toolUseSummary: string | null;
	activityDescription: string | null;
}

export interface PreparedBuiltinToolExecution {
	args: unknown;
	meta: BuiltinExecutionMeta;
	context: BuiltinToolExecutionContext<unknown>;
}

export const defaultBuiltinToolInvoker: BuiltinToolInvoker = async (
	tool,
	args,
	context,
) => await tool.execute(args, context);

export const getBuiltinExecutionMeta = (
	tool: BuiltinTool<unknown, unknown, unknown>,
	args: unknown,
): BuiltinExecutionMeta => ({
	toolUseSummary: tool.getToolUseSummary?.(args as never) ?? null,
	activityDescription: tool.getActivityDescription?.(args as never) ?? null,
});

export const toToolConfirmationRequest = (
	call: ToolCallRequest,
	request: {
		title: string;
		body?: string;
		confirmLabel?: string;
	},
): ToolConfirmationRequest => ({
	toolCallId: call.id,
	toolName: call.name,
	title: request.title,
	body: request.body,
	confirmLabel: request.confirmLabel,
});

export const toToolUserInputRequest = (
	call: ToolCallRequest,
	request: {
		question: string;
		options?: readonly {
			label: string;
			value: string;
			description?: string;
		}[];
		allowFreeText?: boolean;
	},
): ToolUserInputRequest => ({
	toolCallId: call.id,
	toolName: call.name,
	question: request.question,
	options: request.options,
	allowFreeText: request.allowFreeText,
});

export const emitBuiltinToolProgress = (
	call: ToolCallRequest,
	options: ToolExecutionOptions | undefined,
	meta: BuiltinExecutionMeta,
	event: Omit<
		ToolProgressEvent,
		'toolCallId' | 'toolName' | 'toolUseSummary' | 'activityDescription'
	>,
): void => {
	options?.reportProgress?.({
		toolCallId: call.id,
		toolName: call.name,
		toolUseSummary: meta.toolUseSummary,
		activityDescription: meta.activityDescription,
		...event,
	});
};

export const createBuiltinInteractionHandlers = (
	call: ToolCallRequest,
	options: ToolExecutionOptions | undefined,
	emitProgress: (
		event: Pick<ToolProgressEvent, 'phase' | 'message' | 'progress'>
	) => void,
): Pick<
	BuiltinToolExecutionContext<unknown>,
	'requestConfirmation' | 'requestUserInput'
> => ({
	requestConfirmation: async (request) => {
		if (!options?.requestConfirmation) {
			return { decision: 'deny' };
		}
		return await options.requestConfirmation(toToolConfirmationRequest(call, request));
	},
	requestUserInput: async (request) => {
		emitProgress({
			phase: 'user-input',
			message: request.question,
		});
		if (!options?.requestUserInput) {
			throw new BuiltinToolUserInputErrorClass(
				'工具需要用户澄清，但当前执行通道未提供用户输入能力',
				'unavailable',
			);
		}
		return await options.requestUserInput(toToolUserInputRequest(call, request));
	},
});
