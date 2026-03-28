/**
 * @module skills/config
 * @description 提供 skills 域的默认配置与路径常量。
 *
 * @dependencies 无
 * @side-effects 无
 * @invariants 仅处理 skills 域自身常量与简单路径拼接。
 */

export const FRONTMATTER_REGEX = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n)?/u;
export const SKILL_FILE_NAME = 'SKILL.md';
export const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
export const MAX_SKILL_DESCRIPTION_LENGTH = 1024;
export const SKILL_RELOAD_DEBOUNCE_MS = 100;
const AI_SKILLS_SUBFOLDER = 'skills';

/** @precondition value 为任意目录路径字符串 @postcondition 返回移除末尾分隔符后的路径 @throws 从不抛出 @example trimTrailingSlash('System/AI Data/') */
export function trimTrailingSlash(value: string): string {
	return value.replace(/[\\/]+$/gu, '');
}

/** @precondition aiDataFolder 为 AI 数据根目录 @postcondition 返回 skills 子目录路径 @throws 从不抛出 @example buildSkillsRootPath('System/AI Data') */
export function buildSkillsRootPath(aiDataFolder: string): string {
	return `${trimTrailingSlash(aiDataFolder)}/${AI_SKILLS_SUBFOLDER}`;
}