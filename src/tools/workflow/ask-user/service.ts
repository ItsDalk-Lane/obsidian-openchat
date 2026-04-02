import type {
	BuiltinToolExecutionContext,
	BuiltinToolUserInputOption,
	BuiltinValidationResult,
} from '../../runtime/types';
import { BuiltinToolUserInputError } from '../../runtime/types';
import type {
	AskUserArgs,
	AskUserOption,
	AskUserResult,
} from './schema';

const QUESTION_SUMMARY_LIMIT = 96;

const normalizeQuestion = (question: string): string => {
	const normalized = String(question ?? '').replace(/\s+/gu, ' ').trim();
	if (!normalized) {
		throw new Error('question 不能为空');
	}
	return normalized;
};

const normalizeOptions = (
	options?: readonly AskUserOption[],
): BuiltinToolUserInputOption[] | undefined => {
	if (!options || options.length === 0) {
		return undefined;
	}
	const seenValues = new Set<string>();
	return options.map((option, index) => {
		const label = String(option.label ?? '').trim();
		const value = String(option.value ?? '').trim();
		const description = typeof option.description === 'string'
			? option.description.trim()
			: undefined;
		if (!label) {
			throw new Error(`options[${index}].label 不能为空`);
		}
		if (!value) {
			throw new Error(`options[${index}].value 不能为空`);
		}
		if (seenValues.has(value)) {
			throw new Error(`options[${index}].value 必须唯一`);
		}
		seenValues.add(value);
		return {
			label,
			value,
			...(description ? { description } : {}),
		};
	});
};

const normalizeAskUserArgs = (
	args: AskUserArgs,
): {
	question: string;
	options?: BuiltinToolUserInputOption[];
	allowFreeText: boolean;
} => {
	const question = normalizeQuestion(args.question);
	const options = normalizeOptions(args.options);
	const allowFreeText = args.allow_free_text === true;
	if (!options && !allowFreeText) {
		throw new Error('至少提供 options 或启用 allow_free_text');
	}
	return { question, ...(options ? { options } : {}), allowFreeText };
};

export const validateAskUserInput = (
	args: AskUserArgs,
): BuiltinValidationResult => {
	try {
		normalizeAskUserArgs(args);
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
			notes: ['ask_user 只用于澄清问题，不应用于权限确认。'],
		};
	}
};

export const summarizeAskUser = (
	args: Partial<AskUserArgs>,
): string | null => {
	const question = String(args.question ?? '').replace(/\s+/gu, ' ').trim();
	if (!question) {
		return null;
	}
	return question.length <= QUESTION_SUMMARY_LIMIT
		? question
		: `${question.slice(0, QUESTION_SUMMARY_LIMIT - 3)}...`;
};

export const describeAskUserActivity = (
	args: Partial<AskUserArgs>,
): string | null => {
	const summary = summarizeAskUser(args);
	return summary ? `等待用户回答：${summary}` : '等待用户回答澄清问题';
};

export const executeAskUser = async (
	args: AskUserArgs,
	context: BuiltinToolExecutionContext<unknown>,
): Promise<AskUserResult> => {
	const normalized = normalizeAskUserArgs(args);
	const requestUserInput = context.requestUserInput;
	if (!requestUserInput) {
		throw new BuiltinToolUserInputError(
			'工具需要用户澄清，但当前执行通道未提供用户输入能力',
			'unavailable',
		);
	}
	const response = await requestUserInput({
		question: normalized.question,
		options: normalized.options,
		allowFreeText: normalized.allowFreeText,
	});
	if (response.outcome === 'selected') {
		return { answered: true, selected_value: response.selectedValue };
	}
	if (response.outcome === 'free-text') {
		return { answered: true, free_text: response.freeText.trim() };
	}
	throw new BuiltinToolUserInputError('用户取消了澄清问题', 'cancelled');
};
