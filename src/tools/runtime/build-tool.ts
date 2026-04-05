import type {
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

const passValidation = (): BuiltinValidationResult => ({
	ok: true,
});

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
