import type { ObsidianApiProvider, VaultEntry } from 'src/providers/providers.types';
import type { CompareGroup } from '../types/multiModel';
import { getMultiModelConfigPath } from 'src/utils/AIPathManager';

type ConfigChangeCallback = (data: {
	compareGroups: CompareGroup[];
}) => void;

type ConfigType = 'compare-group';

type MultiModelConfigHost = Pick<
	ObsidianApiProvider,
	| 'deleteVaultPath'
	| 'ensureAiDataFolders'
	| 'ensureVaultFolder'
	| 'getFrontmatter'
	| 'getVaultEntry'
	| 'listFolderEntries'
	| 'normalizePath'
	| 'onVaultChange'
	| 'parseYaml'
	| 'readVaultFile'
	| 'stringifyYaml'
	| 'writeVaultFile'
>;

const FRONTMATTER_DELIMITER = '---';

export class MultiModelConfigService {
	private readonly configFolderPath: string;
	private readonly callbacks = new Set<ConfigChangeCallback>();
	private disposeVaultWatch: (() => void) | null = null;
	private reloadTimer: number | null = null;

	constructor(
		private readonly obsidianApi: MultiModelConfigHost,
		private readonly aiDataFolder: string,
	) {
		this.configFolderPath = getMultiModelConfigPath(aiDataFolder);
	}

	async initialize(): Promise<void> {
		await this.obsidianApi.ensureAiDataFolders(this.aiDataFolder);
		this.registerWatchers();
	}

	dispose(): void {
		this.disposeVaultWatch?.();
		this.disposeVaultWatch = null;
		if (this.reloadTimer !== null) {
			window.clearTimeout(this.reloadTimer);
			this.reloadTimer = null;
		}
		this.callbacks.clear();
	}

	async loadCompareGroups(): Promise<CompareGroup[]> {
		const files = await this.listMarkdownFiles();
		const groups = await Promise.all(files.map(async (file) => await this.readCompareGroupFile(file)));
		return groups
			.filter((group): group is CompareGroup => group !== null)
			.sort((left, right) => right.updatedAt - left.updatedAt);
	}

	async saveCompareGroup(group: CompareGroup): Promise<string> {
		await this.ensureFolder();
		const nextGroup: CompareGroup = {
			...group,
			updatedAt: Date.now(),
		};
		const existingFile = await this.findConfigFile('compare-group', group.id);
		const targetPath = existingFile?.path ?? this.getCompareGroupFilePath(group.id);
		await this.obsidianApi.writeVaultFile(targetPath, this.serializeCompareGroup(nextGroup));
		return targetPath;
	}

	async deleteCompareGroup(id: string): Promise<void> {
		const file = await this.findConfigFile('compare-group', id);
		if (file) {
			await this.obsidianApi.deleteVaultPath(file.path);
		}
	}

	watchConfigs(callback: ConfigChangeCallback): () => void {
		this.callbacks.add(callback);
		void this.emitConfigChanges(callback);
		return () => {
			this.callbacks.delete(callback);
		};
	}

	parseCompareGroupFromMarkdown(content: string): CompareGroup | null {
		const { frontmatter, body } = this.extractFrontmatter(content);
		if (frontmatter?.type !== 'compare-group' || typeof frontmatter.id !== 'string') {
			return null;
		}
		const modelTags = body
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.startsWith('- '))
			.map((line) => line.replace(/^- /u, '').trim())
			.filter(Boolean);

		return {
			id: frontmatter.id,
			name: this.toStringValue(frontmatter.name),
			description: this.toStringValue(frontmatter.description),
			modelTags,
			createdAt: this.toNumberValue(frontmatter.createdAt),
			updatedAt: this.toNumberValue(frontmatter.updatedAt),
			isDefault: this.toBooleanValue(frontmatter.isDefault),
		};
	}

	private registerWatchers(): void {
		if (this.disposeVaultWatch) {
			return;
		}
		this.disposeVaultWatch = this.obsidianApi.onVaultChange((event) => {
			if (this.isConfigPath(event.path) || (event.oldPath && this.isConfigPath(event.oldPath))) {
				this.scheduleReload();
			}
		});
	}

	private scheduleReload(): void {
		if (this.reloadTimer !== null) {
			window.clearTimeout(this.reloadTimer);
		}
		this.reloadTimer = window.setTimeout(() => {
			this.reloadTimer = null;
			void this.emitConfigChanges();
		}, 100);
	}

	private async emitConfigChanges(singleCallback?: ConfigChangeCallback): Promise<void> {
		const payload = {
			compareGroups: await this.loadCompareGroups(),
		};
		if (singleCallback) {
			singleCallback(payload);
			return;
		}
		for (const callback of this.callbacks) {
			callback(payload);
		}
	}

	private async ensureFolder(): Promise<VaultEntry> {
		await this.obsidianApi.ensureAiDataFolders(this.aiDataFolder);
		await this.obsidianApi.ensureVaultFolder(this.configFolderPath);
		const folder = this.obsidianApi.getVaultEntry(this.configFolderPath);
		if (folder?.kind !== 'folder') {
			throw new Error(`多模型配置目录不存在: ${this.configFolderPath}`);
		}
		return folder;
	}

	private async listMarkdownFiles(): Promise<VaultEntry[]> {
		const folder = await this.ensureFolder();
		return this.obsidianApi.listFolderEntries(folder.path).filter((child) => {
			return child.kind === 'file' && child.name.toLowerCase().endsWith('.md');
		});
	}

	private async findConfigFile(type: ConfigType, id: string): Promise<VaultEntry | null> {
		const canonicalPath = this.getCompareGroupFilePath(id);
		const canonical = this.obsidianApi.getVaultEntry(canonicalPath);
		if (canonical?.kind === 'file') {
			return canonical;
		}

		for (const file of await this.listMarkdownFiles()) {
			const frontmatter = this.obsidianApi.getFrontmatter(file.path) ?? await this.readFrontmatter(file.path);
			if (frontmatter?.type === type && frontmatter.id === id) {
				return file;
			}
		}
		return null;
	}

	private async readCompareGroupFile(file: VaultEntry): Promise<CompareGroup | null> {
		return this.parseCompareGroupFromMarkdown(await this.obsidianApi.readVaultFile(file.path));
	}

	private serializeCompareGroup(group: CompareGroup): string {
		const frontmatter = this.obsidianApi.stringifyYaml({
			type: 'compare-group',
			id: group.id,
			name: group.name,
			description: group.description,
			createdAt: group.createdAt,
			updatedAt: group.updatedAt,
			isDefault: group.isDefault,
		});
		const modelsBlock = group.modelTags.map((tag) => `- ${tag}`).join('\n');
		return `${FRONTMATTER_DELIMITER}
${frontmatter}${FRONTMATTER_DELIMITER}

## 包含模型

${modelsBlock}
`;
	}

	private extractFrontmatter(content: string): {
		frontmatter: Record<string, unknown> | null;
		body: string;
	} {
		if (!content.startsWith(FRONTMATTER_DELIMITER)) {
			return { frontmatter: null, body: content };
		}
		const secondDelimiterIndex = content.indexOf(FRONTMATTER_DELIMITER, FRONTMATTER_DELIMITER.length);
		if (secondDelimiterIndex === -1) {
			return { frontmatter: null, body: content };
		}
		const frontmatterBlock = content.substring(FRONTMATTER_DELIMITER.length, secondDelimiterIndex).trim();
		return {
			frontmatter: this.obsidianApi.parseYaml(frontmatterBlock) as Record<string, unknown>,
			body: content.substring(secondDelimiterIndex + FRONTMATTER_DELIMITER.length).trim(),
		};
	}

	private async readFrontmatter(filePath: string): Promise<Record<string, unknown> | null> {
		return this.extractFrontmatter(await this.obsidianApi.readVaultFile(filePath)).frontmatter;
	}

	private isConfigPath(path: string): boolean {
		const normalized = this.obsidianApi.normalizePath(path);
		return normalized === this.configFolderPath || normalized.startsWith(`${this.configFolderPath}/`);
	}

	private getCompareGroupFilePath(id: string): string {
		return this.obsidianApi.normalizePath(`${this.configFolderPath}/compare-group-${id}.md`);
	}

	private toStringValue(value: unknown): string {
		return typeof value === 'string' ? value : '';
	}

	private toNumberValue(value: unknown): number {
		if (typeof value === 'number') {
			return value;
		}
		if (typeof value === 'string') {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : 0;
		}
		return 0;
	}

	private toBooleanValue(value: unknown): boolean {
		if (typeof value === 'boolean') {
			return value;
		}
		return typeof value === 'string' && value.trim().toLowerCase() === 'true';
	}
}
