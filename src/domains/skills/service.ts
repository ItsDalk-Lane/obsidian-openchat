/**
 * @module skills/service
 * @description 承载 skills 域的兼容 scanner facade、内容加载与 system prompt 组装逻辑。
 *
 * @dependencies src/domains/skills/types, src/domains/skills/config, src/providers/providers.types
 * @side-effects 读取 Vault、确保 AI 数据目录存在
 * @invariants 不直接导入 obsidian，不反向依赖 settings/core/commands。
 */

import { LocalVaultSkillSource } from './source';
import { SkillRegistry } from './registry';
import type {
	CreateSkillInput,
	LoadedSkillContent,
	SkillChangeListener,
	SkillDefinition,
	SkillId,
	SkillQueryOptions,
	SkillsDomainLogger,
	SkillScanResult,
	SkillSource,
	UpdateSkillInput,
} from './types';
import type { SkillSourceHostPort } from './source';

/** SkillScannerService 所需的最小宿主能力 */
export type SkillScannerHostPort = SkillSourceHostPort;

const isRuntimeEnabledSkill = (skill: SkillDefinition): boolean => skill.metadata.enabled !== false;

export function filterRuntimeEnabledSkills(
	result: SkillScanResult,
): SkillScanResult {
	return {
		...result,
		skills: result.skills.filter((skill) => isRuntimeEnabledSkill(skill)),
	};
}

interface SkillScannerServiceOptions {
	getAiDataFolder: () => string;
	logger?: SkillsDomainLogger;
	source?: SkillSource;
}

/**
 * @precondition obsidianApi 与 getAiDataFolder 由组合根注入
 * @postcondition 提供技能扫描、缓存与正文加载能力
 * @throws 仅在 provider 读取失败时由调用方观察到错误
 */
export class SkillScannerService {
	private readonly source: SkillSource;
	private readonly registry: SkillRegistry;
	private readonly listeners = new Set<SkillChangeListener>();

	constructor(
		private readonly obsidianApi: SkillScannerHostPort,
		private readonly options: SkillScannerServiceOptions,
	) {
		this.source = options.source ?? new LocalVaultSkillSource(this.obsidianApi, {
			getAiDataFolder: options.getAiDataFolder,
			logger: options.logger,
		});
		this.registry = new SkillRegistry(this.source);
	}

	/** @precondition getAiDataFolder 可返回当前 AI 数据目录 @postcondition 返回归一化后的 skills 根目录路径 @throws 从不抛出 @example scanner.getSkillsRootPath() */
	getSkillsRootPath(): string {
		return this.source.getSkillsRootPath();
	}

	/** @precondition 无 @postcondition 返回最近一次扫描缓存，没有缓存则返回 null @throws 从不抛出 @example scanner.getCachedResult() */
	getCachedResult(): SkillScanResult | null {
		return this.registry.getSnapshot();
	}

	/** @precondition Vault provider 可正常列目录与读文件 @postcondition 返回缓存后的扫描结果 @throws 当 provider 级基础设施失败且未被内部降级时抛出 @example await scanner.scan() */
	async scan(): Promise<SkillScanResult> {
		const hadSnapshot = this.registry.getSnapshot() !== null;
		const result = await this.registry.scan();
		if (!hadSnapshot) {
			this.emitChange(result);
		}
		return result;
	}

	/** @precondition Vault provider 可正常列目录与读文件 @postcondition 强制刷新并返回新的扫描结果 @throws 当 provider 级基础设施失败且未被内部降级时抛出 @example await scanner.refresh() */
	async refresh(): Promise<SkillScanResult> {
		const result = await this.registry.refresh();
		this.emitChange(result);
		return result;
	}

	async createSkill(input: CreateSkillInput): Promise<SkillDefinition> {
		const created = await this.source.createSkill(input);
		return await this.refreshAndFindSkill(created.skillFilePath, created);
	}

	async updateSkill(input: UpdateSkillInput): Promise<SkillDefinition> {
		const updated = await this.source.updateSkill(input);
		return await this.refreshAndFindSkill(updated.skillFilePath, updated);
	}

	async removeSkill(skillId: SkillId): Promise<void> {
		await this.source.removeSkill(skillId);
		await this.refresh();
	}

	async setSkillEnabled(skillId: SkillId, enabled: boolean): Promise<SkillDefinition> {
		const updated = await this.source.setSkillEnabled(skillId, enabled);
		return await this.refreshAndFindSkill(updated.skillFilePath, updated);
	}

	async scanRuntimeSkills(): Promise<SkillScanResult> {
		return filterRuntimeEnabledSkills(await this.scan());
	}

	/** @precondition name 为技能名或用户输入片段 @postcondition 默认只返回运行时可执行的同名技能定义 @throws 从不抛出 @example scanner.findByName('alpha') */
	findByName(name: string, options?: SkillQueryOptions): SkillDefinition | undefined {
		return this.registry.findByName(name, options);
	}

	async resolveRelevantSkills(
		query: string,
		limit = 3,
		options?: SkillQueryOptions,
	): Promise<SkillDefinition[]> {
		const trimmedQuery = query.trim();
		if (!trimmedQuery) {
			return [];
		}
		if (!this.registry.getSnapshot()) {
			await this.scan();
		}
		return this.registry.resolveRelevantSkills(trimmedQuery, limit, options);
	}

	/** @precondition path 为技能文件或目录路径 @postcondition 返回路径命中的技能定义或 null @throws 从不抛出 @example scanner.findByPath('System/AI Data/skills/demo/SKILL.md') */
	findByPath(path: string): SkillDefinition | null {
		return this.registry.findById(this.source.normalizePath(path)) ?? null;
	}

	/** @precondition path 为任意 vault 路径 @postcondition 返回 provider 归一化后的路径 @throws 从不抛出 @example scanner.normalizePath('a\\b') */
	normalizePath(path: string): string {
		return this.source.normalizePath(path);
	}

	/** @precondition listener 为幂等或可重复调用的订阅函数 @postcondition 返回可注销该订阅的函数 @throws 从不抛出 @example const off = scanner.onChange(listener) */
	onChange(listener: SkillChangeListener): () => void {
		this.listeners.add(listener);
		const cached = this.registry.getSnapshot();
		if (cached) {
			listener(cached);
		}
		return () => {
			this.listeners.delete(listener);
		};
	}

	/** @precondition 无 @postcondition 清空缓存与索引，下一次 scan 会重新读取 Vault @throws 从不抛出 @example scanner.clearCache() */
	clearCache(): void {
		this.registry.clearCache();
	}

	/** @precondition path 指向某个已注册 Skill 的 SKILL.md @postcondition 返回完整文件内容与剥离 frontmatter 后的正文 @throws 当技能未注册或文件不可读时抛出 @example await scanner.loadSkillContent(path) */
	async loadSkillContent(path: string): Promise<LoadedSkillContent> {
		const normalizedPath = this.source.normalizePath(path);
		let definition = this.registry.findById(normalizedPath);
		if (!definition) {
			await this.scan();
			definition = this.registry.findById(normalizedPath);
		}
		if (!definition) {
			throw new Error(`未找到已注册的 Skill: ${normalizedPath}`);
		}
		const loaded = await this.source.loadSkillContent(normalizedPath);
		return {
			...loaded,
			definition,
		};
	}

	/** @precondition path 为任意 Vault 变更路径 @postcondition 返回该路径是否属于受当前 source 管理的 SKILL.md @throws 从不抛出 @example scanner.isSkillFilePath('System/AI Data/skills/demo/SKILL.md') */
	isSkillFilePath(path: string): boolean {
		return this.source.isSkillFilePath(path);
	}

	private async refreshAndFindSkill(
		skillId: SkillId,
		fallback: SkillDefinition,
	): Promise<SkillDefinition> {
		await this.refresh();
		return this.registry.findById(skillId) ?? fallback;
	}

	private emitChange(result: SkillScanResult): void {
		for (const listener of this.listeners) {
			listener(result);
		}
	}
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
		'Use discover_skills to inspect available skills when the exact skill name is unknown.',
		'Use invoke_skill only after you know the target skill name or when the user gives a slash command such as /commit or /pdf.',
		...skills.flatMap((skill) => [
			'  <skill>',
			`    <name>${escapeXml(skill.metadata.name)}</name>`,
			`    <description>${escapeXml(skill.metadata.description)}</description>`,
			...(skill.metadata.when_to_use
				? [`    <when_to_use>${escapeXml(skill.metadata.when_to_use)}</when_to_use>`]
				: []),
			'    <scope>user</scope>',
			'  </skill>',
		]),
		'</skills>',
	].join('\n');
}
