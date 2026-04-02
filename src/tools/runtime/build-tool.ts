import type {
	BuiltinPermissionDecision,
	BuiltinTool,
	BuiltinToolExecutionContext,
	BuiltinValidationResult,
} from './types';

type BuiltinToolDefaultableKeys =
	| 'isEnabled'
	| 'isReadOnly'
	| 'isDestructive'
	| 'isConcurrencySafe'
	| 'interruptBehavior'
	| 'validateInput'
	| 'checkPermissions'
	| 'getToolUseSummary'
	| 'getActivityDescription';

export type BuiltinToolInput<TArgs = unknown, TResult = unknown, TProgress = never> =
	Omit<BuiltinTool<TArgs, TResult, TProgress>, BuiltinToolDefaultableKeys>
	& Partial<Pick<BuiltinTool<TArgs, TResult, TProgress>, BuiltinToolDefaultableKeys>>;

type BuiltinToolDefaults = Pick<
	BuiltinTool<unknown, unknown, never>,
	BuiltinToolDefaultableKeys
>;

const allowPermission = (
): BuiltinPermissionDecision<unknown> => ({
	behavior: 'allow',
});

const passValidation = (): BuiltinValidationResult => ({
	ok: true,
});

export const BUILTIN_TOOL_DEFAULTS: BuiltinToolDefaults = {
	isEnabled: () => true,
	isReadOnly: () => false,
	isDestructive: () => false,
	isConcurrencySafe: () => false,
	interruptBehavior: () => 'block',
	validateInput: (
		_args: unknown,
		_context: BuiltinToolExecutionContext
	) => passValidation(),
	checkPermissions: (
		_args: unknown,
		_context: BuiltinToolExecutionContext
	) => allowPermission(),
	getToolUseSummary: () => null,
	getActivityDescription: () => null,
};

function createBuiltinToolDefaults<TArgs, TProgress>(): Pick<
	BuiltinTool<TArgs, unknown, TProgress>,
	BuiltinToolDefaultableKeys
> {
	return {
		isEnabled: () => true,
		isReadOnly: () => false,
		isDestructive: () => false,
		isConcurrencySafe: () => false,
		interruptBehavior: () => 'block',
		validateInput: (
			_args: TArgs,
			_context: BuiltinToolExecutionContext<TProgress>
		) => passValidation(),
		checkPermissions: (
			_args: TArgs,
			_context: BuiltinToolExecutionContext<TProgress>
		) => ({ behavior: 'allow' }),
		getToolUseSummary: () => null,
		getActivityDescription: () => null,
	};
}

export function buildBuiltinTool<TArgs = unknown, TResult = unknown, TProgress = never>(
	tool: BuiltinToolInput<TArgs, TResult, TProgress>
): BuiltinTool<TArgs, TResult, TProgress> {
	return {
		...createBuiltinToolDefaults<TArgs, TProgress>(),
		...tool,
	};
}
