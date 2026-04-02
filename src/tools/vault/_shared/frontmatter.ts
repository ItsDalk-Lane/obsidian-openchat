import { parseYaml, stringifyYaml } from 'obsidian';

const FRONTMATTER_DELIMITER = '---';
const FRONTMATTER_REGEX = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n)?/u;

export interface ParsedFrontmatterDocument {
	frontmatter: Record<string, unknown>;
	body: string;
	hasFrontmatter: boolean;
}

const normalizeParsedFrontmatter = (
	value: unknown,
): Record<string, unknown> => {
	if (!value) {
		return {};
	}
	if (typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('frontmatter 必须是对象');
	}
	return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
};

export const parseFrontmatterDocument = (
	content: string,
): ParsedFrontmatterDocument => {
	if (!content.startsWith(FRONTMATTER_DELIMITER)) {
		return {
			frontmatter: {},
			body: content,
			hasFrontmatter: false,
		};
	}

	const matched = content.match(FRONTMATTER_REGEX);
	if (!matched) {
		throw new Error('frontmatter 未正确闭合，无法执行结构化属性编辑');
	}

	return {
		frontmatter: normalizeParsedFrontmatter(parseYaml(matched[1] ?? '')),
		body: content.slice(matched[0].length),
		hasFrontmatter: true,
	};
};

export const serializeFrontmatterDocument = (
	frontmatter: Record<string, unknown>,
	body: string,
): string => {
	if (Object.keys(frontmatter).length === 0) {
		return body;
	}

	const yaml = stringifyYaml(frontmatter).trimEnd();
	if (!body) {
		return `${FRONTMATTER_DELIMITER}\n${yaml}\n${FRONTMATTER_DELIMITER}\n`;
	}

	return `${FRONTMATTER_DELIMITER}\n${yaml}\n${FRONTMATTER_DELIMITER}\n${body}`;
};
