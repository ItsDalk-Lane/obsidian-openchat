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
	readonly license?: string;
	readonly compatibility?: string | string[] | Record<string, unknown>;
	readonly metadata?: Record<string, unknown>;
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

export interface LoadedSkillContent {
	readonly definition: SkillDefinition;
	readonly fullContent: string;
	readonly bodyContent: string;
}

export type SkillChangeListener = (result: SkillScanResult) => void;

export interface SkillsDomainLogger {
	warn(message: string, metadata?: unknown): void;
}