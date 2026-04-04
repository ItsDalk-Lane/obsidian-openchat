/**
 * @module skills/types
 * @description 定义 skills 域的纯类型与状态结构。
 *
 * @dependencies 无
 * @side-effects 无
 * @invariants 不导入其他层，不包含运行时代码。
 */

export interface SkillMetadata {
	readonly name: string;
	readonly description: string;
	readonly enabled?: boolean;
	readonly when_to_use?: string;
	readonly arguments?: readonly SkillArgumentDefinition[];
	readonly execution?: SkillExecutionConfig;
	readonly license?: string;
	readonly compatibility?: string | string[] | Record<string, unknown>;
	readonly metadata?: Record<string, unknown>;
}

export type SkillExecutionMode = 'inline' | 'isolated' | 'isolated_resume';

export type SkillArgumentDefaultValue = string | number | boolean | null;

export interface SkillArgumentDefinition {
	readonly name: string;
	readonly description?: string;
	readonly required?: boolean;
	readonly default?: SkillArgumentDefaultValue;
}

export interface SkillExecutionConfig {
	readonly mode: SkillExecutionMode;
}

export interface SkillDefinition {
	readonly metadata: SkillMetadata;
	readonly skillFilePath: string;
	readonly basePath: string;
	readonly bodyContent?: string;
}

export interface SkillToolInput {
	readonly skill: string;
	readonly args?: string;
}

export interface SkillScanError {
	readonly path: string;
	readonly reason: string;
	readonly severity?: 'warning' | 'error';
}

export interface SkillScanResult {
	readonly skills: SkillDefinition[];
	readonly errors: SkillScanError[];
}

export interface SkillQueryOptions {
	readonly includeDisabled?: boolean;
}

export interface LoadedSkillContent {
	readonly definition: SkillDefinition;
	readonly fullContent: string;
	readonly bodyContent: string;
}

export type SkillId = string;

export interface CreateSkillInput {
	readonly name: string;
	readonly description: string;
	readonly bodyContent?: string;
	readonly enabled?: boolean;
	readonly when_to_use?: string;
	readonly arguments?: readonly SkillArgumentDefinition[];
	readonly execution?: SkillExecutionConfig;
	readonly license?: string;
	readonly compatibility?: SkillMetadata['compatibility'];
	readonly metadata?: Record<string, unknown>;
}

export interface UpdateSkillInput {
	readonly skillId: SkillId;
	readonly description?: string;
	readonly bodyContent?: string;
	readonly when_to_use?: string | null;
	readonly arguments?: readonly SkillArgumentDefinition[] | null;
	readonly execution?: SkillExecutionConfig | null;
	readonly license?: string | null;
	readonly compatibility?: SkillMetadata['compatibility'] | null;
	readonly metadata?: Record<string, unknown> | null;
}

export type SkillSourceKind = 'local';

export interface SkillSource {
	readonly sourceId: string;
	readonly kind: SkillSourceKind;
	getSkillsRootPath(): string;
	scan(): Promise<SkillScanResult>;
	normalizePath(path: string): string;
	loadSkillContent(path: string): Promise<LoadedSkillContent>;
	createSkill(input: CreateSkillInput): Promise<SkillDefinition>;
	updateSkill(input: UpdateSkillInput): Promise<SkillDefinition>;
	removeSkill(skillId: SkillId): Promise<void>;
	setSkillEnabled(skillId: SkillId, enabled: boolean): Promise<SkillDefinition>;
	isSkillFilePath(path: string): boolean;
}

export type SkillChangeListener = (result: SkillScanResult) => void;

export interface SkillsDomainLogger {
	warn(message: string, metadata?: unknown): void;
}
