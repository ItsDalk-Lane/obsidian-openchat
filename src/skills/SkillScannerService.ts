import { App, TFile, TFolder, normalizePath, parseYaml } from 'obsidian';
import { ensureAIDataFolders, getSkillsPath } from 'src/utils/AIPathManager';
import { DebugLogger } from 'src/utils/DebugLogger';
import type {
	SkillDefinition,
	SkillMetadata,
	SkillScanError,
	SkillScanResult,
} from './types';

const FRONTMATTER_REGEX = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n)?/;
const SKILL_FILE_NAME = 'SKILL.md';
const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const MAX_DESCRIPTION_LENGTH = 1024;

interface SkillScannerServiceOptions {
	getAiDataFolder: () => string;
}

export class SkillScannerService {
	private cache: SkillScanResult | null = null;
	private scanPromise: Promise<SkillScanResult> | null = null;
	private readonly skillsByName = new Map<string, SkillDefinition>();
	private readonly skillsByPath = new Map<string, SkillDefinition>();

	constructor(
		private readonly app: App,
		private readonly options: SkillScannerServiceOptions,
	) {}

	getSkillsRootPath(): string {
		return getSkillsPath(this.options.getAiDataFolder());
	}

	getCachedResult(): SkillScanResult | null {
		return this.cache;
	}

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

	findByName(name: string): SkillDefinition | undefined {
		return this.skillsByName.get(name.trim());
	}

	findByPath(path: string): SkillDefinition | null {
		return this.skillsByPath.get(normalizePath(path)) ?? null;
	}

	clearCache(): void {
		this.cache = null;
		this.skillsByName.clear();
		this.skillsByPath.clear();
	}

	private async doScan(): Promise<SkillScanResult> {
		const aiDataFolder = this.options.getAiDataFolder();
		await ensureAIDataFolders(this.app, aiDataFolder);
		const skillsRootPath = this.getSkillsRootPath();
		const root = this.app.vault.getAbstractFileByPath(skillsRootPath);

		if (!(root instanceof TFolder)) {
			const result: SkillScanResult = { skills: [], errors: [] };
			this.cacheResult(result);
			return result;
		}

		const skills: SkillDefinition[] = [];
		const errors: SkillScanError[] = [];
		const indexByName = new Map<string, number>();

		for (const child of root.children) {
			if (!(child instanceof TFolder)) {
				continue;
			}

			const skillFile = child.children.find((entry): entry is TFile => {
				return entry instanceof TFile && entry.name === SKILL_FILE_NAME;
			});
			if (!skillFile) {
				continue;
			}

			try {
				const metadata = await this.readSkillMetadata(skillFile);
				const definition: SkillDefinition = {
					metadata,
					skillFilePath: skillFile.path,
					basePath: child.path,
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
				DebugLogger.warn('[SkillScannerService] Skill 解析失败', {
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
			this.skillsByPath.set(normalizePath(skill.skillFilePath), skill);
		}
	}

	private async readSkillMetadata(file: TFile): Promise<SkillMetadata> {
		const content = await this.app.vault.read(file);
		const match = content.match(FRONTMATTER_REGEX);
		if (!match) {
			throw new Error('SKILL.md 缺少有效的 YAML frontmatter');
		}

		let parsed: Record<string, unknown>;
		try {
			const yaml = parseYaml(match[1]);
			if (!yaml || typeof yaml !== 'object' || Array.isArray(yaml)) {
				throw new Error('frontmatter 必须是对象');
			}
			parsed = yaml as Record<string, unknown>;
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			throw new Error(`frontmatter 解析失败: ${reason}`);
		}

		const name = this.requireTrimmedString(parsed.name, 'name');
		if (!SKILL_NAME_PATTERN.test(name)) {
			throw new Error('frontmatter.name 不符合命名规范');
		}

		const description = this.requireTrimmedString(parsed.description, 'description');
		if (description.length > MAX_DESCRIPTION_LENGTH) {
			throw new Error('frontmatter.description 超过 1024 字符限制');
		}

		const metadata: SkillMetadata = {
			name,
			description,
		};

		if (typeof parsed.license === 'string' && parsed.license.trim()) {
			metadata.license = parsed.license.trim();
		}
		if (this.isCompatibilityValue(parsed.compatibility)) {
			metadata.compatibility = parsed.compatibility;
		}
		if (parsed.metadata && typeof parsed.metadata === 'object' && !Array.isArray(parsed.metadata)) {
			metadata.metadata = parsed.metadata as Record<string, unknown>;
		}

		return metadata;
	}

	private requireTrimmedString(value: unknown, fieldName: string): string {
		if (typeof value !== 'string' || !value.trim()) {
			throw new Error(`frontmatter.${fieldName} 为必填项`);
		}
		return value.trim();
	}

	private isCompatibilityValue(value: unknown): value is SkillMetadata['compatibility'] {
		if (typeof value === 'string') {
			return true;
		}
		if (Array.isArray(value)) {
			return value.every((entry) => typeof entry === 'string');
		}
		return !!value && typeof value === 'object';
	}
}
