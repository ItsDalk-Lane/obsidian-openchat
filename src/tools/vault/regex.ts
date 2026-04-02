const MAX_REGEX_LENGTH = 160;
const NESTED_QUANTIFIER_PATTERN = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)(?:[+*]|\{\d+(?:,\d*)?\})/u;
const BACKREFERENCE_PATTERN = /\\[1-9]/u;

export const resolveRegex = (regex?: string): RegExp | null => {
	const value = String(regex ?? '').trim();
	if (!value) return null;
	if (value.length > MAX_REGEX_LENGTH) {
		throw new Error(`非法正则表达式: 长度不能超过 ${MAX_REGEX_LENGTH} 个字符`);
	}
	if (NESTED_QUANTIFIER_PATTERN.test(value) || BACKREFERENCE_PATTERN.test(value)) {
		throw new Error('非法正则表达式: 包含高风险模式');
	}
	try {
		return new RegExp(value);
	} catch (error) {
		throw new Error(
			`非法正则表达式: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}
};