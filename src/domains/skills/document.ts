import {
	DEFAULT_NEW_SKILL_BODY,
	DEFAULT_SKILL_ENABLED,
	DEFAULT_SKILL_EXECUTION_MODE,
	FRONTMATTER_REGEX,
	MAX_SKILL_DESCRIPTION_LENGTH,
	SKILL_EXECUTION_MODES,
	SKILL_NAME_PATTERN,
} from './config';
import type {
	CreateSkillInput,
	SkillArgumentDefaultValue,
	SkillArgumentDefinition,
	SkillExecutionConfig,
	SkillExecutionMode,
	SkillMetadata,
	UpdateSkillInput,
} from './types';
import type { YamlPort } from 'src/providers/providers.types';

type SkillYamlReader = Pick<YamlPort, 'parseYaml'>;

export function parseSkillMetadata(content: string, obsidianApi: SkillYamlReader): SkillMetadata {
	const parsed = parseFrontmatter(content, obsidianApi);
	const name = normalizeSkillName(parsed.name);
	const description = normalizeSkillDescription(parsed.description);
	const enabled = readOptionalBoolean(parsed.enabled, 'enabled') ?? DEFAULT_SKILL_ENABLED;
	const whenToUse = readOptionalTrimmedString(parsed.when_to_use, 'when_to_use');
	const argumentDefinitions = parseSkillArguments(parsed.arguments);
	const execution = parseSkillExecution(parsed.execution);
	const allowedTools = parseAllowedTools(parsed.allowed_tools);
	const license = readOptionalTrimmedString(parsed.license, 'license');
	const compatibility = parseCompatibilityValue(parsed.compatibility);
	const additionalMetadata = parseNestedMetadata(parsed.metadata);
	return {
		name,
		description,
		enabled,
		execution,
		...(whenToUse !== undefined ? { when_to_use: whenToUse } : {}),
		...(argumentDefinitions !== undefined ? { arguments: argumentDefinitions } : {}),
		...(allowedTools !== undefined ? { allowed_tools: allowedTools } : {}),
		...(license !== undefined ? { license } : {}),
		...(compatibility !== undefined ? { compatibility } : {}),
		...(additionalMetadata !== undefined ? { metadata: additionalMetadata } : {}),
	};
}

export function parseRawSkillFrontmatter(
	content: string,
	obsidianApi: SkillYamlReader,
): Record<string, unknown> {
	return { ...parseFrontmatter(content, obsidianApi) };
}
export function stripSkillFrontmatter(content: string): string {
	const match = content.match(FRONTMATTER_REGEX);
	return match ? content.slice(match[0].length) : content;
}
export function serializeSkillDocument(
	frontmatter: Record<string, unknown>,
	bodyContent: string,
	obsidianApi: YamlPort,
): string {
	const yaml = obsidianApi.stringifyYaml(frontmatter).trimEnd();
	return `---\n${yaml}\n---\n${bodyContent}`;
}
export function buildFrontmatterForCreate(metadata: SkillMetadata): Record<string, unknown> {
	return orderSkillFrontmatter({
		name: metadata.name,
		description: metadata.description,
		enabled: metadata.enabled ?? DEFAULT_SKILL_ENABLED,
		execution: metadata.execution?.mode ?? DEFAULT_SKILL_EXECUTION_MODE,
		...(metadata.when_to_use !== undefined ? { when_to_use: metadata.when_to_use } : {}),
		...(metadata.arguments !== undefined ? { arguments: cloneSkillArguments(metadata.arguments) } : {}),
		...(metadata.allowed_tools !== undefined
			? { allowed_tools: [...metadata.allowed_tools] }
			: {}),
		...(metadata.license !== undefined ? { license: metadata.license } : {}),
		...(metadata.compatibility !== undefined
			? { compatibility: cloneCompatibilityValue(metadata.compatibility) }
			: {}),
		...(metadata.metadata !== undefined ? { metadata: { ...metadata.metadata } } : {}),
	});
}
export function normalizeCreateSkillInput(input: CreateSkillInput): SkillMetadata {
	const whenToUse = normalizeOptionalText(input.when_to_use);
	const argumentsValue = input.arguments === undefined
		? undefined
		: cloneSkillArguments(validateSkillArguments(input.arguments));
	const allowedTools = input.allowed_tools === undefined
		? undefined
		: validateAllowedTools(input.allowed_tools);
	const license = normalizeOptionalText(input.license);
	return {
		name: normalizeSkillName(input.name),
		description: normalizeSkillDescription(input.description),
		enabled: input.enabled ?? DEFAULT_SKILL_ENABLED,
		execution: normalizeExecutionConfig(input.execution)
			?? { mode: DEFAULT_SKILL_EXECUTION_MODE },
		...(whenToUse !== undefined ? { when_to_use: whenToUse } : {}),
		...(argumentsValue !== undefined ? { arguments: argumentsValue } : {}),
		...(allowedTools !== undefined ? { allowed_tools: allowedTools } : {}),
		...(license !== undefined ? { license } : {}),
		...(input.compatibility !== undefined
			? { compatibility: cloneCompatibilityValue(input.compatibility) }
			: {}),
		...(input.metadata !== undefined ? { metadata: { ...input.metadata } } : {}),
	};
}
export function applyUpdateToSkillMetadata(
	existing: SkillMetadata,
	input: UpdateSkillInput,
): SkillMetadata {
	const next: Record<string, unknown> = {
		...existing,
		...(input.description !== undefined
			? { description: normalizeSkillDescription(input.description) }
			: {}),
	};
	if (input.when_to_use !== undefined) {
		setOptionalObjectValue(next, 'when_to_use', normalizeOptionalText(input.when_to_use));
	}
	if (input.arguments !== undefined) {
		setOptionalObjectValue(
			next,
			'arguments',
			input.arguments === null ? undefined : cloneSkillArguments(validateSkillArguments(input.arguments)),
		);
	}
	if (input.execution !== undefined) {
		setOptionalObjectValue(
			next,
			'execution',
			input.execution === null ? undefined : normalizeExecutionConfig(input.execution),
		);
	}
	if (input.allowed_tools !== undefined) {
		setOptionalObjectValue(
			next,
			'allowed_tools',
			input.allowed_tools === null ? undefined : validateAllowedTools(input.allowed_tools),
		);
	}
	if (input.license !== undefined) {
		setOptionalObjectValue(next, 'license', normalizeOptionalText(input.license));
	}
	if (input.compatibility !== undefined) {
		setOptionalObjectValue(
			next,
			'compatibility',
			input.compatibility === null ? undefined : cloneCompatibilityValue(input.compatibility),
		);
	}
	if (input.metadata !== undefined) {
		setOptionalObjectValue(
			next,
			'metadata',
			input.metadata === null ? undefined : { ...input.metadata },
		);
	}
	return next as unknown as SkillMetadata;
}
export function applyUpdateToFrontmatter(
	frontmatter: Record<string, unknown>,
	input: UpdateSkillInput,
): Record<string, unknown> {
	const next = { ...frontmatter };
	if (input.description !== undefined) {
		next.description = normalizeSkillDescription(input.description);
	}
	if (input.when_to_use !== undefined) {
		setOptionalObjectValue(next, 'when_to_use', normalizeOptionalText(input.when_to_use));
	}
	if (input.arguments !== undefined) {
		setOptionalObjectValue(
			next,
			'arguments',
			input.arguments === null ? undefined : cloneSkillArguments(validateSkillArguments(input.arguments)),
		);
	}
	if (input.execution !== undefined) {
		setOptionalObjectValue(
			next,
			'execution',
			input.execution === null ? undefined : normalizeExecutionConfig(input.execution)?.mode,
		);
	}
	if (input.allowed_tools !== undefined) {
		setOptionalObjectValue(
			next,
			'allowed_tools',
			input.allowed_tools === null ? undefined : validateAllowedTools(input.allowed_tools),
		);
	}
	if (input.license !== undefined) {
		setOptionalObjectValue(next, 'license', normalizeOptionalText(input.license));
	}
	if (input.compatibility !== undefined) {
		setOptionalObjectValue(
			next,
			'compatibility',
			input.compatibility === null ? undefined : cloneCompatibilityValue(input.compatibility),
		);
	}
	if (input.metadata !== undefined) {
		setOptionalObjectValue(
			next,
			'metadata',
			input.metadata === null ? undefined : { ...input.metadata },
		);
	}
	return orderSkillFrontmatter(next);
}
export function orderSkillFrontmatter(frontmatter: Record<string, unknown>): Record<string, unknown> {
	const ordered: Record<string, unknown> = {};
	for (const key of [
		'name',
		'description',
		'enabled',
		'when_to_use',
		'arguments',
		'execution',
		'allowed_tools',
		'license',
		'compatibility',
		'metadata',
	]) {
		if (frontmatter[key] !== undefined) {
			ordered[key] = frontmatter[key];
		}
	}
	for (const [key, value] of Object.entries(frontmatter)) {
		if (ordered[key] === undefined && value !== undefined) {
			ordered[key] = value;
		}
	}
	return ordered;
}
export function normalizeBodyContent(value: string | undefined): string {
	return value ?? DEFAULT_NEW_SKILL_BODY;
}
function parseFrontmatter(content: string, obsidianApi: SkillYamlReader): Record<string, unknown> {
	const match = content.match(FRONTMATTER_REGEX);
	if (!match) {
		throw new Error('SKILL.md 缺少有效的 YAML frontmatter');
	}
	try {
		const yaml = obsidianApi.parseYaml(match[1]);
		if (!yaml || typeof yaml !== 'object' || Array.isArray(yaml)) {
			throw new Error('frontmatter 必须是对象');
		}
		return yaml as Record<string, unknown>;
	} catch (error) {
		throw new Error(`frontmatter 解析失败: ${error instanceof Error ? error.message : String(error)}`);
	}
}
function requireTrimmedString(value: unknown, fieldName: string): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`frontmatter.${fieldName} 为必填项`);
	}
	return value.trim();
}
function normalizeSkillName(value: unknown): string {
	const name = requireTrimmedString(value, 'name');
	if (!SKILL_NAME_PATTERN.test(name)) {
		throw new Error('frontmatter.name 不符合命名规范');
	}
	return name;
}
function normalizeSkillDescription(value: unknown): string {
	const description = requireTrimmedString(value, 'description');
	if (description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
		throw new Error('frontmatter.description 超过 1024 字符限制');
	}
	return description;
}
function readOptionalTrimmedString(value: unknown, fieldName: string): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== 'string') {
		throw new Error(`frontmatter.${fieldName} 必须是字符串`);
	}
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}
function normalizeOptionalText(value: string | null | undefined): string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}
function readOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== 'boolean') {
		throw new Error(`frontmatter.${fieldName} 必须是布尔值`);
	}
	return value;
}
function parseSkillArguments(value: unknown): readonly SkillArgumentDefinition[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value)) {
		throw new Error('frontmatter.arguments 必须是数组');
	}
	return value.map((entry, index) => parseSkillArgument(entry, index));
}
function parseSkillArgument(entry: unknown, index: number): SkillArgumentDefinition {
	if (!isRecord(entry)) {
		throw new Error(`frontmatter.arguments[${index}] 必须是对象`);
	}
	const name = requireTrimmedString(entry.name, `arguments[${index}].name`);
	const description = readOptionalTrimmedString(
		entry.description,
		`arguments[${index}].description`,
	);
	const required = readOptionalBoolean(entry.required, `arguments[${index}].required`);
	const defaultValue = parseSkillArgumentDefaultValue(
		entry.default,
		`arguments[${index}].default`,
	);
	return {
		name,
		...(description !== undefined ? { description } : {}),
		...(required !== undefined ? { required } : {}),
		...(defaultValue !== undefined ? { default: defaultValue } : {}),
	};
}
function validateSkillArguments(
	value: readonly SkillArgumentDefinition[],
): readonly SkillArgumentDefinition[] {
	return value.map((argument, index) => ({
		name: requireTrimmedString(argument.name, `arguments[${index}].name`),
		...(argument.description !== undefined
			? {
				description: readOptionalTrimmedString(
					argument.description,
					`arguments[${index}].description`,
				),
			}
			: {}),
		...(argument.required !== undefined
			? { required: readOptionalBoolean(argument.required, `arguments[${index}].required`) }
			: {}),
		...(argument.default !== undefined
			? {
				default: parseSkillArgumentDefaultValue(
					argument.default,
					`arguments[${index}].default`,
				),
			}
			: {}),
	}));
}
function parseSkillArgumentDefaultValue(
	value: unknown,
	fieldName: string,
): SkillArgumentDefaultValue | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (
		value === null
		|| typeof value === 'string'
		|| typeof value === 'number'
		|| typeof value === 'boolean'
	) {
		return value;
	}
	throw new Error(`frontmatter.${fieldName} 必须是标量值`);
}
function parseSkillExecution(value: unknown): SkillExecutionConfig {
	if (value === undefined) {
		return { mode: DEFAULT_SKILL_EXECUTION_MODE };
	}
	if (typeof value === 'string') {
		return { mode: parseSkillExecutionMode(value, 'execution') };
	}
	if (!isRecord(value)) {
		throw new Error('frontmatter.execution 必须是字符串或对象');
	}
	const modeValue = value.mode === undefined ? DEFAULT_SKILL_EXECUTION_MODE : value.mode;
	return {
		mode: parseSkillExecutionMode(modeValue, 'execution.mode'),
	};
}
function normalizeExecutionConfig(
	value: SkillExecutionConfig | undefined,
): SkillExecutionConfig | undefined {
	if (!value) {
		return undefined;
	}
	return {
		mode: parseSkillExecutionMode(value.mode, 'execution.mode'),
	};
}
function parseSkillExecutionMode(value: unknown, fieldName: string): SkillExecutionMode {
	if (typeof value !== 'string') {
		throw new Error(`frontmatter.${fieldName} 必须是字符串`);
	}
	if (!SKILL_EXECUTION_MODES.includes(value as SkillExecutionMode)) {
		throw new Error(`frontmatter.${fieldName} 不支持该执行模式`);
	}
	return value as SkillExecutionMode;
}
function parseAllowedTools(value: unknown): readonly string[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value)) {
		throw new Error('frontmatter.allowed_tools 必须是数组');
	}
	return validateAllowedTools(value);
}
function validateAllowedTools(value: readonly string[]): readonly string[] {
	return value.map((entry, index) => {
		if (typeof entry !== 'string' || !entry.trim()) {
			throw new Error(`frontmatter.allowed_tools[${index}] 必须是非空字符串`);
		}
		return entry.trim();
	});
}
function parseCompatibilityValue(
	value: unknown,
): SkillMetadata['compatibility'] | undefined {
	return isCompatibilityValue(value) ? value : undefined;
}
function parseNestedMetadata(value: unknown): Record<string, unknown> | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	return value;
}
function cloneSkillArguments(
	value: readonly SkillArgumentDefinition[],
): readonly SkillArgumentDefinition[] {
	return value.map((argument) => ({ ...argument }));
}
function cloneCompatibilityValue(
	value: SkillMetadata['compatibility'],
): SkillMetadata['compatibility'] {
	if (typeof value === 'string') {
		return value;
	}
	if (Array.isArray(value)) {
		return [...value];
	}
	return { ...value };
}
function isCompatibilityValue(value: unknown): value is SkillMetadata['compatibility'] {
	if (typeof value === 'string') {
		return true;
	}
	if (Array.isArray(value)) {
		return value.every((entry) => typeof entry === 'string');
	}
	return isRecord(value);
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}
function setOptionalObjectValue(
	target: Record<string, unknown>,
	key: string,
	value: unknown,
): void {
	if (value === undefined) {
		delete target[key];
		return;
	}
	target[key] = value;
}