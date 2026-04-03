/**
 * @module skills/source
 * @description 提供 skills 域的来源抽象与本地 Vault 来源实现。
 *
 * @dependencies src/domains/skills/types, src/domains/skills/config, src/providers/providers.types
 * @side-effects 读取 Vault、确保 AI 数据目录存在
 * @invariants 当前只实现 local 来源，但接口需保持未来可扩展。
 */

import {
	buildSkillsRootPath,
	SKILL_FILE_NAME,
	trimTrailingSlash,
} from './config';
import type {
	CreateSkillInput,
	LoadedSkillContent,
	SkillDefinition,
	SkillId,
	SkillMetadata,
	SkillScanError,
	SkillScanResult,
	SkillsDomainLogger,
	SkillSource,
	UpdateSkillInput,
} from './types';
import {
	applyUpdateToFrontmatter,
	applyUpdateToSkillMetadata,
	buildFrontmatterForCreate,
	normalizeBodyContent,
	normalizeCreateSkillInput,
	orderSkillFrontmatter,
	parseRawSkillFrontmatter,
	parseSkillMetadata,
	serializeSkillDocument,
	stripSkillFrontmatter,
} from './document';
import type {
	VaultPathPort,
	VaultReadPort,
	VaultWritePort,
	YamlPort,
} from 'src/providers/providers.types';

export type SkillSourceHostPort = VaultPathPort & VaultReadPort & VaultWritePort & YamlPort;

interface LocalVaultSkillSourceOptions {
	getAiDataFolder: () => string;
	logger?: SkillsDomainLogger;
	sourceId?: string;
}

interface ParsedSkillDocument {
	readonly definition: SkillDefinition;
	readonly frontmatter: Record<string, unknown>;
	readonly fullContent: string;
	readonly bodyContent: string;
}

export class LocalVaultSkillSource implements SkillSource {
	readonly kind = 'local';
	readonly sourceId: string;

	constructor(
		private readonly obsidianApi: SkillSourceHostPort,
		private readonly options: LocalVaultSkillSourceOptions,
	) {
		this.sourceId = options.sourceId ?? 'local-vault';
	}

	getSkillsRootPath(): string {
		return this.obsidianApi.normalizePath(buildSkillsRootPath(this.options.getAiDataFolder()));
	}

	async scan(): Promise<SkillScanResult> {
		return await this.doScan();
	}

	normalizePath(path: string): string {
		return this.obsidianApi.normalizePath(path);
	}

	async loadSkillContent(path: string): Promise<LoadedSkillContent> {
		const normalizedPath = this.obsidianApi.normalizePath(path);
		const fullContent = await this.obsidianApi.readVaultFile(normalizedPath);
		const definition: SkillDefinition = {
			metadata: parseSkillMetadata(fullContent, this.obsidianApi),
			skillFilePath: normalizedPath,
			basePath: this.buildBasePath(normalizedPath),
		};
		return {
			definition,
			fullContent,
			bodyContent: stripSkillFrontmatter(fullContent),
		};
	}

	async createSkill(input: CreateSkillInput): Promise<SkillDefinition> {
		const metadata = normalizeCreateSkillInput(input);
		const existingSkills = await this.scan();
		if (existingSkills.skills.some((skill) => skill.metadata.name === metadata.name)) {
			throw new Error(`Skill 已存在: ${metadata.name}`);
		}
		const basePath = this.buildSkillBasePath(metadata.name);
		const skillFilePath = this.buildSkillFilePath(basePath);
		if (this.obsidianApi.getVaultEntry(basePath) || this.obsidianApi.getVaultEntry(skillFilePath)) {
			throw new Error(`Skill 目录已存在: ${basePath}`);
		}
		await this.obsidianApi.ensureVaultFolder(this.getSkillsRootPath());
		await this.obsidianApi.ensureVaultFolder(basePath);
		const bodyContent = normalizeBodyContent(input.bodyContent);
		await this.obsidianApi.writeVaultFile(
			skillFilePath,
			serializeSkillDocument(buildFrontmatterForCreate(metadata), bodyContent, this.obsidianApi),
		);
		return {
			metadata,
			skillFilePath,
			basePath,
			bodyContent,
		};
	}

	async updateSkill(input: UpdateSkillInput): Promise<SkillDefinition> {
		const document = await this.readSkillDocument(input.skillId);
		const metadata = applyUpdateToSkillMetadata(document.definition.metadata, input);
		const frontmatter = applyUpdateToFrontmatter(document.frontmatter, input);
		const bodyContent = input.bodyContent ?? document.bodyContent;
		await this.obsidianApi.writeVaultFile(
			document.definition.skillFilePath,
			serializeSkillDocument(orderSkillFrontmatter(frontmatter), bodyContent, this.obsidianApi),
		);
		return {
			...document.definition,
			metadata,
			bodyContent,
		};
	}

	async removeSkill(skillId: SkillId): Promise<void> {
		const { basePath, skillFilePath } = this.resolveSkillLocation(skillId);
		this.assertManagedBasePath(basePath);
		const entry = this.obsidianApi.getVaultEntry(skillFilePath);
		if (!entry || entry.kind !== 'file') {
			throw new Error(`未找到对应 Skill: ${skillFilePath}`);
		}
		await this.obsidianApi.deleteVaultPath(basePath);
	}

	async setSkillEnabled(skillId: SkillId, enabled: boolean): Promise<SkillDefinition> {
		const document = await this.readSkillDocument(skillId);
		const frontmatter = orderSkillFrontmatter({
			...document.frontmatter,
			enabled,
		});
		await this.obsidianApi.writeVaultFile(
			document.definition.skillFilePath,
			serializeSkillDocument(frontmatter, document.bodyContent, this.obsidianApi),
		);
		return {
			...document.definition,
			metadata: {
				...document.definition.metadata,
				enabled,
			},
		};
	}

	isSkillFilePath(path: string): boolean {
		const normalizedPath = this.obsidianApi.normalizePath(path);
		const skillsRootPath = this.getSkillsRootPath();
		if (!normalizedPath || !skillsRootPath) {
			return false;
		}
		if (normalizedPath !== skillsRootPath && !normalizedPath.startsWith(`${skillsRootPath}/`)) {
			return false;
		}
		return normalizedPath.endsWith(`/${SKILL_FILE_NAME}`);
	}

	private async readSkillDocument(skillId: SkillId): Promise<ParsedSkillDocument> {
		const { skillFilePath, basePath } = this.resolveSkillLocation(skillId);
		this.assertManagedBasePath(basePath);
		const fullContent = await this.obsidianApi.readVaultFile(skillFilePath);
		return {
			definition: {
				metadata: parseSkillMetadata(fullContent, this.obsidianApi),
				skillFilePath,
				basePath,
			},
			frontmatter: parseRawSkillFrontmatter(fullContent, this.obsidianApi),
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
				skills.push({
					metadata,
					skillFilePath: this.obsidianApi.normalizePath(skillFile.path),
					basePath: this.obsidianApi.normalizePath(folderEntry.path),
				});
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

		return { skills, errors };
	}

	private async readSkillMetadata(filePath: string): Promise<SkillMetadata> {
		return parseSkillMetadata(await this.obsidianApi.readVaultFile(filePath), this.obsidianApi);
	}

	private buildSkillBasePath(skillName: string): string {
		return this.obsidianApi.normalizePath(`${this.getSkillsRootPath()}/${skillName}`);
	}

	private buildSkillFilePath(basePath: string): string {
		return this.obsidianApi.normalizePath(`${trimTrailingSlash(basePath)}/${SKILL_FILE_NAME}`);
	}

	private buildBasePath(filePath: string): string {
		const skillFileSuffix = `/${SKILL_FILE_NAME}`;
		if (filePath.endsWith(skillFileSuffix)) {
			return filePath.slice(0, -skillFileSuffix.length);
		}
		const lastSlashIndex = filePath.lastIndexOf('/');
		return lastSlashIndex >= 0 ? filePath.slice(0, lastSlashIndex) : filePath;
	}

	private resolveSkillLocation(skillId: SkillId): { skillFilePath: string; basePath: string } {
		const normalizedId = this.obsidianApi.normalizePath(skillId);
		const skillFilePath = normalizedId.endsWith(`/${SKILL_FILE_NAME}`)
			? normalizedId
			: this.buildSkillFilePath(normalizedId);
		return {
			skillFilePath,
			basePath: this.buildBasePath(skillFilePath),
		};
	}

	private assertManagedBasePath(basePath: string): void {
		const normalizedBasePath = this.obsidianApi.normalizePath(basePath);
		const skillsRoot = this.getSkillsRootPath();
		if (
			normalizedBasePath !== skillsRoot
			&& !normalizedBasePath.startsWith(`${skillsRoot}/`)
		) {
			throw new Error(`Skill 路径不在受管目录内: ${normalizedBasePath}`);
		}
	}
}
export { parseSkillMetadata, stripSkillFrontmatter };