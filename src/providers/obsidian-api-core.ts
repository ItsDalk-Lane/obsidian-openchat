import type {
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
	}>;
	getAbstractFileByPath(path: string): ObsidianVaultNode | null;
	pathExists(path: string): Promise<boolean>;
	statPath(path: string): Promise<VaultStat | null>;
	readVaultFile(path: string): Promise<string>;
	readVaultBinary(path: string): Promise<ArrayBuffer>;
	writeVaultFile(path: string, content: string): Promise<void>;
	writeVaultBinary(path: string, content: ArrayBuffer): Promise<void>;
	deleteVaultPath(path: string): Promise<void>;
	parseYaml(content: string): unknown;
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
			};
		},
		getVaultEntry(path: string): VaultEntry | null {
			return toVaultEntry(runtime.getAbstractFileByPath(runtime.normalizePath(path)));
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