import { App, TFile, TFolder, normalizePath, parseYaml } from 'obsidian';
import { ensureAIDataFolders, getAgentsPath } from 'src/utils/AIPathManager';
import { DebugLogger } from 'src/utils/DebugLogger';
import type {
	SubAgentDefinition,
	SubAgentMetadata,
	SubAgentScanError,
	SubAgentScanResult,
} from './types';
import {
	normalizeOptionalModel,
	normalizePositiveInteger,
	normalizeStringArray,
	requireNonEmptyString,
} from './types';

const FRONTMATTER_REGEX = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n)?/;

interface SubAgentScannerServiceOptions {
	getAiDataFolder: () => string;
}

export class SubAgentScannerService {
	private cache: SubAgentScanResult | null = null;
	private scanPromise: Promise<SubAgentScanResult> | null = null;
	private readonly agentsByName = new Map<string, SubAgentDefinition>();
	private readonly agentsByPath = new Map<string, SubAgentDefinition>();

	constructor(
		private readonly app: App,
		private readonly options: SubAgentScannerServiceOptions,
	) {}

	getAgentsRootPath(): string {
		return getAgentsPath(this.options.getAiDataFolder());
	}

	getCachedResult(): SubAgentScanResult | null {
		return this.cache;
	}

	async scan(): Promise<SubAgentScanResult> {
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

	async findByName(name: string): Promise<SubAgentDefinition | null> {
		const normalizedName = name.trim();
		if (!this.cache) {
			await this.scan();
		}
		return this.agentsByName.get(normalizedName) ?? null;
	}

	findByPath(path: string): SubAgentDefinition | null {
		return this.agentsByPath.get(normalizePath(path)) ?? null;
	}

	clearCache(): void {
		this.cache = null;
		this.agentsByName.clear();
		this.agentsByPath.clear();
	}

	private async doScan(): Promise<SubAgentScanResult> {
		const aiDataFolder = this.options.getAiDataFolder();
		await ensureAIDataFolders(this.app, aiDataFolder);
		const agentsRootPath = this.getAgentsRootPath();
		const root = this.app.vault.getAbstractFileByPath(agentsRootPath);

		if (!(root instanceof TFolder)) {
			const result: SubAgentScanResult = { agents: [], errors: [] };
			this.cacheResult(result);
			return result;
		}

		const files = this.app.vault.getFiles().filter((file) => {
			const normalizedPath = normalizePath(file.path);
			return (
				normalizedPath.startsWith(`${normalizePath(root.path)}/`)
				&& normalizedPath.toLowerCase().endsWith('.md')
			);
		});

		const agents: SubAgentDefinition[] = [];
		const errors: SubAgentScanError[] = [];
		const indexByName = new Map<string, number>();

		for (const file of files) {
			try {
				const definition = await this.readSubAgentDefinition(file);
				const existingIndex = indexByName.get(definition.metadata.name);
				if (existingIndex !== undefined) {
					errors.push({
						path: file.path,
						reason: `Sub Agent 名称重复，已覆盖先前定义: ${definition.metadata.name}`,
						severity: 'warning',
					});
					agents[existingIndex] = definition;
					continue;
				}

				indexByName.set(definition.metadata.name, agents.length);
				agents.push(definition);
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				errors.push({
					path: file.path,
					reason,
					severity: 'error',
				});
				DebugLogger.warn('[SubAgentScannerService] Sub Agent 解析失败', {
					path: file.path,
					reason,
				});
			}
		}

		agents.sort((left, right) => left.metadata.name.localeCompare(right.metadata.name));
		const result: SubAgentScanResult = { agents, errors };
		this.cacheResult(result);
		return result;
	}

	private cacheResult(result: SubAgentScanResult): void {
		this.cache = result;
		this.agentsByName.clear();
		this.agentsByPath.clear();
		for (const agent of result.agents) {
			this.agentsByName.set(agent.metadata.name, agent);
			this.agentsByPath.set(normalizePath(agent.agentFilePath), agent);
		}
	}

	private async readSubAgentDefinition(file: TFile): Promise<SubAgentDefinition> {
		const content = await this.app.vault.read(file);
		const match = content.match(FRONTMATTER_REGEX);
		if (!match) {
			throw new Error('Sub Agent 文件缺少有效的 YAML frontmatter');
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

		const metadata: SubAgentMetadata = {
			name: requireNonEmptyString(parsed.name, 'name'),
			description: requireNonEmptyString(parsed.description, 'description'),
		};

		if (Array.isArray(parsed.tools)) {
			metadata.tools = normalizeStringArray(parsed.tools) ?? [];
		}
		if (Array.isArray(parsed.mcps)) {
			metadata.mcps = normalizeStringArray(parsed.mcps) ?? [];
		}

		const models = normalizeOptionalModel(parsed.models);
		if (models) {
			metadata.models = models;
		}

		const maxTokens = normalizePositiveInteger(parsed.maxTokens);
		if (maxTokens) {
			metadata.maxTokens = maxTokens;
		}

		return {
			metadata,
			agentFilePath: normalizePath(file.path),
			systemPrompt: content.slice(match[0].length).trim(),
		};
	}
}
