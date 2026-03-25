import {
	type ConditionBinaryNode,
	type ConditionLiteralNode,
	type ConditionNode,
	type ConditionToken,
	wrapQueryError,
} from './vault-query-types';

export const tokenizeCondition = (input: string): ConditionToken[] => {
	const tokens: ConditionToken[] = [];
	let index = 0;

	while (index < input.length) {
		const char = input[index];
		if (/\s/.test(char)) {
			index += 1;
			continue;
		}

		const twoChars = input.slice(index, index + 2);
		if (['&&', '||', '==', '!=', '>=', '<='].includes(twoChars)) {
			tokens.push({ type: 'operator', value: twoChars });
			index += 2;
			continue;
		}

		if (char === '>' || char === '<' || char === '!') {
			tokens.push({ type: 'operator', value: char });
			index += 1;
			continue;
		}

		if (char === '(') {
			tokens.push({ type: 'lparen' });
			index += 1;
			continue;
		}
		if (char === ')') {
			tokens.push({ type: 'rparen' });
			index += 1;
			continue;
		}
		if (char === '[') {
			tokens.push({ type: 'lbracket' });
			index += 1;
			continue;
		}
		if (char === ']') {
			tokens.push({ type: 'rbracket' });
			index += 1;
			continue;
		}
		if (char === ',') {
			tokens.push({ type: 'comma' });
			index += 1;
			continue;
		}

		if (char === '"' || char === '\'') {
			let value = '';
			const quote = char;
			let closed = false;
			index += 1;
			while (index < input.length) {
				const inner = input[index];
				if (inner === '\\') {
					if (index + 1 >= input.length) {
						throw wrapQueryError('字符串转义不完整');
					}
					value += input[index + 1];
					index += 2;
					continue;
				}
				if (inner === quote) {
					index += 1;
					closed = true;
					break;
				}
				value += inner;
				index += 1;
			}
			if (!closed) {
				throw wrapQueryError('字符串字面量未正确闭合');
			}
			tokens.push({ type: 'string', value });
			continue;
		}

		const numberMatch = input.slice(index).match(/^-?\d+(?:\.\d+)?/);
		if (numberMatch) {
			tokens.push({ type: 'number', value: Number(numberMatch[0]) });
			index += numberMatch[0].length;
			continue;
		}

		const identifierMatch = input.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
		if (identifierMatch) {
			const word = identifierMatch[0];
			if (word === 'true' || word === 'false') {
				tokens.push({ type: 'boolean', value: word === 'true' });
			} else if (word === 'null') {
				tokens.push({ type: 'null', value: null });
			} else if (['contains', 'in', 'matches'].includes(word)) {
				tokens.push({ type: 'operator', value: word });
			} else {
				tokens.push({ type: 'identifier', value: word });
			}
			index += word.length;
			continue;
		}

		throw wrapQueryError(`无法解析条件表达式中的字符: ${char}`);
	}

	return tokens;
};

class ConditionTokenStream {
	private index = 0;

	constructor(private readonly tokens: ConditionToken[]) {}

	peek(): ConditionToken | undefined {
		return this.tokens[this.index];
	}

	consume(): ConditionToken {
		const token = this.tokens[this.index];
		if (!token) {
			throw wrapQueryError('条件表达式意外结束');
		}
		this.index += 1;
		return token;
	}

	match(type: ConditionToken['type'], value?: ConditionToken['value']): boolean {
		const token = this.peek();
		if (!token || token.type !== type) {
			return false;
		}
		if (typeof value !== 'undefined' && token.value !== value) {
			return false;
		}
		this.index += 1;
		return true;
	}

	expect(type: ConditionToken['type'], value?: ConditionToken['value']): ConditionToken {
		const token = this.consume();
		if (token.type !== type || (typeof value !== 'undefined' && token.value !== value)) {
			throw wrapQueryError(`条件表达式中缺少 ${String(value ?? type)}`);
		}
		return token;
	}

	get hasRemaining(): boolean {
		return this.index < this.tokens.length;
	}
}

export const parseConditionExpression = (input: string): ConditionNode => {
	const trimmed = input.trim();
	if (!trimmed) {
		throw wrapQueryError('条件表达式不能为空');
	}
	const stream = new ConditionTokenStream(tokenizeCondition(trimmed));
	const node = parseOrExpression(stream);
	if (stream.hasRemaining) {
		throw wrapQueryError('条件表达式包含无法识别的尾部内容');
	}
	return node;
};

const parseOrExpression = (stream: ConditionTokenStream): ConditionNode => {
	let node = parseAndExpression(stream);
	while (stream.match('operator', '||')) {
		node = {
			type: 'binary',
			operator: '||',
			left: node,
			right: parseAndExpression(stream),
		};
	}
	return node;
};

const parseAndExpression = (stream: ConditionTokenStream): ConditionNode => {
	let node = parseUnaryExpression(stream);
	while (stream.match('operator', '&&')) {
		node = {
			type: 'binary',
			operator: '&&',
			left: node,
			right: parseUnaryExpression(stream),
		};
	}
	return node;
};

const parseUnaryExpression = (stream: ConditionTokenStream): ConditionNode => {
	if (stream.match('operator', '!')) {
		return {
			type: 'unary',
			operator: '!',
			operand: parseUnaryExpression(stream),
		};
	}
	return parseComparisonExpression(stream);
};

const parseComparisonExpression = (stream: ConditionTokenStream): ConditionNode => {
	let node = parsePrimaryExpression(stream);
	const operator = stream.peek();
	if (
		operator?.type === 'operator'
		&& ['==', '!=', '>', '>=', '<', '<=', 'contains', 'in', 'matches'].includes(
			String(operator.value)
		)
	) {
		stream.consume();
		node = {
			type: 'binary',
			operator: operator.value as ConditionBinaryNode['operator'],
			left: node,
			right: parsePrimaryExpression(stream),
		};
	}
	return node;
};

const parsePrimaryExpression = (stream: ConditionTokenStream): ConditionNode => {
	const token = stream.peek();
	if (!token) {
		throw wrapQueryError('条件表达式意外结束');
	}

	if (stream.match('lparen')) {
		const node = parseOrExpression(stream);
		stream.expect('rparen');
		return node;
	}

	if (stream.match('lbracket')) {
		const items: ConditionLiteralNode[] = [];
		if (!stream.match('rbracket')) {
			do {
				const item = parsePrimaryExpression(stream);
				if (item.type !== 'literal') {
					throw wrapQueryError('数组字面量只支持字符串、数字、布尔值或 null');
				}
				items.push(item);
			} while (stream.match('comma'));
			stream.expect('rbracket');
		}
		return {
			type: 'array',
			items,
		};
	}

	if (token.type === 'identifier') {
		stream.consume();
		return {
			type: 'identifier',
			name: String(token.value),
		};
	}
	if (
		token.type === 'string'
		|| token.type === 'number'
		|| token.type === 'boolean'
		|| token.type === 'null'
	) {
		stream.consume();
		return {
			type: 'literal',
			value: token.value as string | number | boolean | null,
		};
	}

	throw wrapQueryError(`无法识别的条件值: ${String(token.value ?? token.type)}`);
};
