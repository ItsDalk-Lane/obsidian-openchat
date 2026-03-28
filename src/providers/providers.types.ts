/**
 * @module providers/types
 * @description 定义跨域 Provider 的最小接口。
 *
 * @dependencies 无
 * @side-effects 无
 * @invariants 只暴露稳定接口，不承载实现细节。
 */

export interface ObsidianApiProvider {
	notify(message: string, timeout?: number): void;
	buildGlobalSystemPrompt(featureId: string): Promise<string>;
	normalizePath(path: string): string;
	ensureAiDataFolders(aiDataFolder: string): Promise<void>;
	ensureVaultFolder(folderPath: string): Promise<string>;
	requestHttp(options: HttpRequestOptions): Promise<HttpResponseData>;
	getVaultEntry(path: string): VaultEntry | null;
	pathExists(path: string): Promise<boolean>;
	statPath(path: string): Promise<VaultStat | null>;
	listFolderEntries(folderPath: string): readonly VaultEntry[];
	readVaultFile(filePath: string): Promise<string>;
	readVaultBinary(filePath: string): Promise<ArrayBuffer>;
	writeVaultFile(filePath: string, content: string): Promise<void>;
	writeVaultBinary(filePath: string, content: ArrayBuffer): Promise<void>;
	deleteVaultPath(path: string): Promise<void>;
	parseYaml(content: string): unknown;
	onVaultChange(listener: (event: VaultChangeEvent) => void): () => void;
}

export interface HttpRequestOptions {
	readonly url: string;
	readonly method: 'GET' | 'POST' | 'DELETE';
	readonly headers?: Record<string, string>;
	readonly body?: string;
}

export interface HttpResponseData {
	readonly status: number;
	readonly text: string;
	readonly headers: Record<string, string>;
}

export interface VaultEntry {
	readonly path: string;
	readonly name: string;
	readonly kind: 'file' | 'folder';
}

export interface VaultStat {
	readonly size: number;
	readonly mtime: number;
	readonly ctime: number;
}

export interface VaultChangeEvent {
	readonly type: 'create' | 'modify' | 'delete' | 'rename';
	readonly path: string;
	readonly oldPath?: string;
}

export interface SettingsProvider<TSettings> {
	getSnapshot(): Readonly<TSettings>;
	replaceSettings(nextSettings: TSettings): Promise<TSettings>;
	updateSettings(updater: (current: Readonly<TSettings>) => TSettings): Promise<TSettings>;
}

export interface EventBus<TEvents extends Record<string, unknown>> {
	emit<TKey extends keyof TEvents>(eventName: TKey, payload: TEvents[TKey]): void;
	on<TKey extends keyof TEvents>(eventName: TKey, listener: (payload: TEvents[TKey]) => void): () => void;
	clear(): void;
}
