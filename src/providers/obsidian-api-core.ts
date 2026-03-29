import type {
	EditorInsertResult,
	HttpRequestOptions,
	HttpResponseData,
	ObsidianApiProvider,
	VaultEntry,
	VaultChangeEvent,
	VaultStat,
} from './providers.types';

export interface ObsidianVaultNode {
	readonly path: string;
	readonly name: string;
	readonly kind: 'file' | 'folder';
	readonly children?: readonly ObsidianVaultNode[];
}

export interface ObsidianApiRuntime {
	notify(message: string, timeout?: number): void;
	normalizePath(path: string): string;
	ensureAiDataFolders(aiDataFolder: string): Promise<void>;
	ensureVaultFolder(folderPath: string): Promise<string>;
	requestUrl(options: HttpRequestOptions): Promise<{
		readonly status: number;
		readonly text?: string;
		readonly headers: Record<string, string>;
		readonly json?: unknown;
		readonly arrayBuffer?: ArrayBuffer;
	}>;
	getAbstractFileByPath(path: string): ObsidianVaultNode | null;
	getVaultName(): string;
	getActiveFilePath(): string | null;
	getAvailablePathForAttachment(filename: string): Promise<string>;
	getFrontmatter(path: string): Record<string, unknown> | null;
	pathExists(path: string): Promise<boolean>;
	statPath(path: string): Promise<VaultStat | null>;
	readVaultFile(path: string): Promise<string>;
	readVaultBinary(path: string): Promise<ArrayBuffer>;
	writeVaultFile(path: string, content: string): Promise<void>;
	writeVaultBinary(path: string, content: ArrayBuffer): Promise<void>;
	deleteVaultPath(path: string): Promise<void>;
	parseYaml(content: string): unknown;
	stringifyYaml(content: unknown): string;
	readLocalStorage(key: string): string | null;
	writeLocalStorage(key: string, value: string): void;
	openSettingsTab(tabId: string): void;
	insertTextIntoMarkdownEditor(content: string): EditorInsertResult;
	openInternalLink(linkTarget: string, sourcePath?: string): void;
	renderMarkdown(
		markdown: string,
		container: HTMLElement,
		sourcePath: string,
		component: unknown,
	): Promise<void>;
	onVaultChange(type: VaultChangeEvent['type'], listener: (path: string, oldPath?: string) => void): unknown;
	offVaultChange(ref: unknown): void;
}

export function createObsidianApiProviderFromRuntime(
	runtime: ObsidianApiRuntime,
	buildGlobalSystemPrompt: (featureId: string) => Promise<string>,
): ObsidianApiProvider {
	return {
		notify(message: string, timeout?: number): void {
			runtime.notify(message, timeout);
		},
		async buildGlobalSystemPrompt(featureId: string): Promise<string> {
			return await buildGlobalSystemPrompt(featureId);
		},
		normalizePath(path: string): string {
			return runtime.normalizePath(path);
		},
		async ensureAiDataFolders(aiDataFolder: string): Promise<void> {
			await runtime.ensureAiDataFolders(aiDataFolder);
		},
		async ensureVaultFolder(folderPath: string): Promise<string> {
			return await runtime.ensureVaultFolder(runtime.normalizePath(folderPath));
		},
		async requestHttp(options: HttpRequestOptions): Promise<HttpResponseData> {
			const response = await runtime.requestUrl(options);
			return {
				status: response.status,
				text: typeof response.text === 'string' ? response.text : '',
				headers: { ...response.headers },
				json: response.json,
				arrayBuffer: response.arrayBuffer,
			};
		},
		getVaultEntry(path: string): VaultEntry | null {
			return toVaultEntry(runtime.getAbstractFileByPath(runtime.normalizePath(path)));
		},
		getVaultName(): string {
			return runtime.getVaultName();
		},
		getActiveFilePath(): string | null {
			return runtime.getActiveFilePath();
		},
		async getAvailableAttachmentPath(filename: string): Promise<string> {
			return await runtime.getAvailablePathForAttachment(filename);
		},
		getFrontmatter(filePath: string): Record<string, unknown> | null {
			return runtime.getFrontmatter(runtime.normalizePath(filePath));
		},
		async pathExists(path: string): Promise<boolean> {
			return await runtime.pathExists(runtime.normalizePath(path));
		},
		async statPath(path: string): Promise<VaultStat | null> {
			return await runtime.statPath(runtime.normalizePath(path));
		},
		listFolderEntries(folderPath: string): readonly VaultEntry[] {
			const folder = runtime.getAbstractFileByPath(runtime.normalizePath(folderPath));
			if (!folder || folder.kind !== 'folder') {
				return [];
			}
			return (folder.children ?? []).map((entry) => toVaultEntry(entry)).filter((entry): entry is VaultEntry => entry !== null);
		},
		async readVaultFile(filePath: string): Promise<string> {
			const normalizedPath = runtime.normalizePath(filePath);
			const file = runtime.getAbstractFileByPath(normalizedPath);
			if (!file || file.kind !== 'file') {
				throw new Error(`文件不存在: ${normalizedPath}`);
			}
			return await runtime.readVaultFile(normalizedPath);
		},
		async readVaultBinary(filePath: string): Promise<ArrayBuffer> {
			const normalizedPath = runtime.normalizePath(filePath);
			const file = runtime.getAbstractFileByPath(normalizedPath);
			if (!file || file.kind !== 'file') {
				throw new Error(`文件不存在: ${normalizedPath}`);
			}
			return await runtime.readVaultBinary(normalizedPath);
		},
		async writeVaultFile(filePath: string, content: string): Promise<void> {
			await runtime.writeVaultFile(runtime.normalizePath(filePath), content);
		},
		async writeVaultBinary(filePath: string, content: ArrayBuffer): Promise<void> {
			await runtime.writeVaultBinary(runtime.normalizePath(filePath), content);
		},
		async deleteVaultPath(path: string): Promise<void> {
			await runtime.deleteVaultPath(runtime.normalizePath(path));
		},
		parseYaml(content: string): unknown {
			return runtime.parseYaml(content);
		},
		stringifyYaml(content: unknown): string {
			return runtime.stringifyYaml(content);
		},
		readLocalStorage(key: string): string | null {
			return runtime.readLocalStorage(key);
		},
		writeLocalStorage(key: string, value: string): void {
			runtime.writeLocalStorage(key, value);
		},
		openSettingsTab(tabId: string): void {
			runtime.openSettingsTab(tabId);
		},
		insertTextIntoMarkdownEditor(content: string): EditorInsertResult {
			return runtime.insertTextIntoMarkdownEditor(content);
		},
		openInternalLink(linkTarget: string, sourcePath?: string): void {
			runtime.openInternalLink(linkTarget, sourcePath);
		},
		async renderMarkdown(
			markdown: string,
			container: HTMLElement,
			sourcePath: string,
			component: unknown,
		): Promise<void> {
			await runtime.renderMarkdown(markdown, container, sourcePath, component);
		},
		onVaultChange(listener: (event: VaultChangeEvent) => void): () => void {
			const refs = (['create', 'modify', 'delete', 'rename'] as const).map((type) =>
				runtime.onVaultChange(type, (path, oldPath) => {
					listener(type === 'rename' ? { type, path, oldPath } : { type, path });
				}),
			);
			return () => {
				for (const ref of refs) {
					runtime.offVaultChange(ref);
				}
			};
		},
	};
}

function toVaultEntry(node: ObsidianVaultNode | null): VaultEntry | null {
	if (!node) {
		return null;
	}
	return {
		path: node.path,
		name: node.name,
		kind: node.kind,
	};
}
