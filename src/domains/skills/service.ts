/**
 * @module skills/service
 * @description 承载 skills 域的扫描、内容加载与 system prompt 组装逻辑。
 *
 * @dependencies src/domains/skills/types, src/domains/skills/config, src/providers/providers.types
 * @side-effects 读取 Vault、确保 AI 数据目录存在
 * @invariants 不直接导入 obsidian，不反向依赖 settings/core/commands。
 */

import {
	buildSkillsRootPath,
	FRONTMATTER_REGEX,
	MAX_SKILL_DESCRIPTION_LENGTH,
	SKILL_FILE_NAME,
	SKILL_NAME_PATTERN,
} from './config';
import type {
	LoadedSkillContent,
	SkillDefinition,
	SkillsDomainLogger,
	SkillMetadata,
	SkillScanError,
	SkillScanResult,
} from './types';
import type { ObsidianApiProvider } from 'src/providers/providers.types';

interface SkillScannerServiceOptions {
	getAiDataFolder: () => string;
	logger?: SkillsDomainLogger;
}

/**
 * @precondition obsidianApi 与 getAiDataFolder 由组合根注入
 * @postcondition 提供技能扫描、缓存与正文加载能力
 * @throws 仅在 provider 读取失败时由调用方观察到错误
 */
export class SkillScannerService {
	private cache: SkillScanResult | null = null;
	private scanPromise: Promise<SkillScanResult> | null = null;
	private readonly skillsByName = new Map<string, SkillDefinition>();
	private readonly skillsByPath = new Map<string, SkillDefinition>();

	constructor(
		private readonly obsidianApi: ObsidianApiProvider,
		private readonly options: SkillScannerServiceOptions,
	) {}

	/** @precondition getAiDataFolder 可返回当前 AI 数据目录 @postcondition 返回归一化后的 skills 根目录路径 @throws 从不抛出 @example scanner.getSkillsRootPath() */
	getSkillsRootPath(): string {
		return this.obsidianApi.normalizePath(buildSkillsRootPath(this.options.getAiDataFolder()));
	}

	/** @precondition 无 @postcondition 返回最近一次扫描缓存，没有缓存则返回 null @throws 从不抛出 @example scanner.getCachedResult() */
	getCachedResult(): SkillScanResult | null {
		return this.cache;
	}

	/** @precondition Vault provider 可正常列目录与读文件 @postcondition 返回缓存后的扫描结果 @throws 当 provider 级基础设施失败且未被内部降级时抛出 @example await scanner.scan() */
	async scan(): Promise<SkillScanResult> {
		if (this.cache) {
			return this.cache;
		}
		if (!this.scanPromise) {
			this.scanPromise = this.doScan().finally(() => {
				this.scanPromise = null;
			});
		}
		return await this.scanPromise;
	}

	/** @precondition name 为技能名或用户输入片段 @postcondition 返回缓存中的同名技能定义 @throws 从不抛出 @example scanner.findByName('alpha') */
	findByName(name: string): SkillDefinition | undefined {
		return this.skillsByName.get(name.trim());
	}

	/** @precondition path 为技能文件或目录路径 @postcondition 返回路径命中的技能定义或 null @throws 从不抛出 @example scanner.findByPath('System/AI Data/skills/demo/SKILL.md') */
	findByPath(path: string): SkillDefinition | null {
		return this.skillsByPath.get(this.obsidianApi.normalizePath(path)) ?? null;
	}

	/** @precondition path 为任意 vault 路径 @postcondition 返回 provider 归一化后的路径 @throws 从不抛出 @example scanner.normalizePath('a\\b') */
	normalizePath(path: string): string {
		return this.obsidianApi.normalizePath(path);
	}

	/** @precondition 无 @postcondition 清空缓存与索引，下一次 scan 会重新读取 Vault @throws 从不抛出 @example scanner.clearCache() */
	clearCache(): void {
		this.cache = null;
		this.skillsByName.clear();
		this.skillsByPath.clear();
	}

	/** @precondition path 指向某个已注册 Skill 的 SKILL.md @postcondition 返回完整文件内容与剥离 frontmatter 后的正文 @throws 当技能未注册或文件不可读时抛出 @example await scanner.loadSkillContent(path) */
	async loadSkillContent(path: string): Promise<LoadedSkillContent> {
		const normalizedPath = this.obsidianApi.normalizePath(path);
		let definition = this.findByPath(normalizedPath);
		if (!definition) {
			await this.scan();
			definition = this.findByPath(normalizedPath);
		}
		if (!definition) {
			throw new Error(`未找到已注册的 Skill: ${normalizedPath}`);
		}
		const fullContent = await this.obsidianApi.readVaultFile(normalizedPath);
		return {
			definition,
			fullContent,
			bodyContent: stripSkillFrontmatter(fullContent),
		};
	}

	private async doScan(): Promise<SkillScanResult> {
		const aiDataFolder = this.options.getAiDataFolder();
		await this.obsidianApi.ensureAiDataFolders(aiDataFolder);
		const skillsRootPath = this.getSkillsRootPath();
		const skills: SkillDefinition[] = [];
		const errors: SkillScanError[] = [];
		const indexByName = new Map<string, number>();

		for (const folderEntry of this.obsidianApi.listFolderEntries(skillsRootPath)) {
			if (folderEntry.kind !== 'folder') {
				continue;
			}
			const skillFile = this.obsidianApi
				.listFolderEntries(folderEntry.path)
				.find((entry) => entry.kind === 'file' && entry.name === SKILL_FILE_NAME);
			if (!skillFile) {
				continue;
			}
			try {
				const metadata = await this.readSkillMetadata(skillFile.path);
				const definition: SkillDefinition = {
					metadata,
					skillFilePath: skillFile.path,
					basePath: folderEntry.path,
				};
				const existingIndex = indexByName.get(metadata.name);
				if (existingIndex !== undefined) {
					errors.push({
						path: skillFile.path,
						reason: `Skill 名称重复，已覆盖先前定义: ${metadata.name}`,
						severity: 'warning',
					});
					skills[existingIndex] = definition;
					continue;
				}
				indexByName.set(metadata.name, skills.length);
				skills.push(definition);
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				errors.push({
					path: skillFile.path,
					reason,
					severity: 'error',
				});
				this.options.logger?.warn('[SkillsDomain] Skill 解析失败', {
					path: skillFile.path,
					reason,
				});
			}
		}

		skills.sort((left, right) => left.metadata.name.localeCompare(right.metadata.name));
		const result: SkillScanResult = { skills, errors };
		this.cacheResult(result);
		return result;
	}

	private cacheResult(result: SkillScanResult): void {
		this.cache = result;
		this.skillsByName.clear();
		this.skillsByPath.clear();
		for (const skill of result.skills) {
			this.skillsByName.set(skill.metadata.name, skill);
			this.skillsByPath.set(this.obsidianApi.normalizePath(skill.skillFilePath), skill);
		}
	}

	private async readSkillMetadata(filePath: string): Promise<SkillMetadata> {
		return parseSkillMetadata(await this.obsidianApi.readVaultFile(filePath), this.obsidianApi);
	}
}

/** @precondition content 为 SKILL.md 原始内容 @postcondition 返回经校验后的 frontmatter 元数据 @throws 当前置 YAML 缺失、非法或字段不合规时抛出 @example parseSkillMetadata('---\nname: demo\ndescription: desc\n---', obsidianApi) */
export function parseSkillMetadata(content: string, obsidianApi: Pick<ObsidianApiProvider, 'parseYaml'>): SkillMetadata {
	const match = content.match(FRONTMATTER_REGEX);
	if (!match) {
		throw new Error('SKILL.md 缺少有效的 YAML frontmatter');
	}
	let parsed: Record<string, unknown>;
	try {
		const yaml = obsidianApi.parseYaml(match[1]);
		if (!yaml || typeof yaml !== 'object' || Array.isArray(yaml)) {
			throw new Error('frontmatter 必须是对象');
		}
		parsed = yaml as Record<string, unknown>;
	} catch (error) {
		throw new Error(`frontmatter 解析失败: ${error instanceof Error ? error.message : String(error)}`);
	}
	const name = requireTrimmedString(parsed.name, 'name');
	if (!SKILL_NAME_PATTERN.test(name)) {
		throw new Error('frontmatter.name 不符合命名规范');
	}
	const description = requireTrimmedString(parsed.description, 'description');
	if (description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
		throw new Error('frontmatter.description 超过 1024 字符限制');
	}
	const metadata: SkillMetadata = { name, description };
	if (typeof parsed.license === 'string' && parsed.license.trim()) {
		metadata.license = parsed.license.trim();
	}
	if (isCompatibilityValue(parsed.compatibility)) {
		metadata.compatibility = parsed.compatibility;
	}
	if (parsed.metadata && typeof parsed.metadata === 'object' && !Array.isArray(parsed.metadata)) {
		metadata.metadata = parsed.metadata as Record<string, unknown>;
	}
	return metadata;
}

/** @precondition content 为 SKILL.md 原始内容 @postcondition 返回剥离 frontmatter 后的正文 @throws 从不抛出 @example stripSkillFrontmatter('---\nname: demo\ndescription: desc\n---\nbody') */
export function stripSkillFrontmatter(content: string): string {
	const match = content.match(FRONTMATTER_REGEX);
	return match ? content.slice(match[0].length) : content;
}

/** @precondition basePath 与 bodyContent 来自同一技能定义 @postcondition 返回工具调用所需的规范化输出文本 @throws 从不抛出 @example formatSkillToolResult('folder\\skill', 'body', (path) => path) */
export function formatSkillToolResult(basePath: string, bodyContent: string, normalizePath: (path: string) => string): string {
	const normalizedBasePath = normalizePath(basePath).replace(/[\\/]+$/gu, '');
	return `Base Path: ${normalizedBasePath}/\n\n${bodyContent}`;
}

/** @precondition scanner 已完成初始化或可自行扫描 @postcondition 返回对应技能正文载荷 @throws 当技能未注册或文件不可读时抛出 @example await loadSkillContent(scanner, path) */
export function loadSkillContent(scanner: SkillScannerService, path: string): Promise<LoadedSkillContent> {
	return scanner.loadSkillContent(path);
}

/** @precondition skills 为可公开暴露的技能定义列表 @postcondition 返回安全转义后的 skills XML 片段 @throws 从不抛出 @example buildSkillsSystemPromptBlock([]) */
export function buildSkillsSystemPromptBlock(skills: readonly SkillDefinition[]): string {
	const escapeXml = (value: string): string => value
		.replace(/&/gu, '&amp;')
		.replace(/</gu, '&lt;')
		.replace(/>/gu, '&gt;')
		.replace(/"/gu, '&quot;')
		.replace(/'/gu, '&apos;');
	return [
		'<skills>',
		'Priority: Match user requests to the best available skill before using other commands. | Skills listed before commands',
		'Invoke via: skill(name="item-name") — omit leading slash for commands.',
		...skills.flatMap((skill) => [
			'  <skill>',
			`    <name>${escapeXml(skill.metadata.name)}</name>`,
			`    <description>${escapeXml(skill.metadata.description)}</description>`,
			'    <scope>user</scope>',
			'  </skill>',
		]),
		'</skills>',
	].join('\n');
}

function requireTrimmedString(value: unknown, fieldName: string): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`frontmatter.${fieldName} 为必填项`);
	}
	return value.trim();
}

function isCompatibilityValue(value: unknown): value is SkillMetadata['compatibility'] {
	if (typeof value === 'string') {
		return true;
	}
	if (Array.isArray(value)) {
		return value.every((entry) => typeof entry === 'string');
	}
	return !!value && typeof value === 'object';
}