/**
 * @module providers/types
 * @description 定义跨域 Provider 的窄接口（Port）与兼容全量接口。
 *
 * 每个 Port 代表一组稳定、有边界意义的宿主能力契约。
 * 域层应根据实际需求依赖最小 Port 组合，而非全量 ObsidianApiProvider。
 *
 * @dependencies 无
 * @side-effects 无
 * @invariants 只暴露稳定接口，不承载实现细节。
 */

// ── 窄接口（按职责拆分） ───────────────────────────

/** 用户通知能力 */
export interface NoticePort {
	notify(message: string, timeout?: number): void;
}

/** Vault 路径归一化与目录结构保障能力 */
export interface VaultPathPort {
	normalizePath(path: string): string;
	ensureAiDataFolders(aiDataFolder: string): Promise<void>;
	ensureVaultFolder(folderPath: string): Promise<string>;
}

/** Vault 只读查询能力 */
export interface VaultReadPort {
	getVaultEntry(path: string): VaultEntry | null;
	getVaultName(): string;
	getActiveFilePath(): string | null;
	getAvailableAttachmentPath(filename: string): Promise<string>;
	getFrontmatter(filePath: string): Record<string, unknown> | null;
	pathExists(path: string): Promise<boolean>;
	statPath(path: string): Promise<VaultStat | null>;
	listFolderEntries(folderPath: string): readonly VaultEntry[];
	readVaultFile(filePath: string): Promise<string>;
	readVaultBinary(filePath: string): Promise<ArrayBuffer>;
}

/** Vault 写入与删除能力 */
export interface VaultWritePort {
	writeVaultFile(filePath: string, content: string): Promise<void>;
	writeVaultBinary(filePath: string, content: ArrayBuffer): Promise<void>;
	deleteVaultPath(path: string): Promise<void>;
}

/** Vault 变更监听能力 */
export interface VaultWatchPort {
	onVaultChange(listener: (event: VaultChangeEvent) => void): () => void;
}

/** HTTP 请求能力 */
export interface HttpRequestPort {
	requestHttp(options: HttpRequestOptions): Promise<HttpResponseData>;
}

/** YAML 解析与序列化能力 */
export interface YamlPort {
	parseYaml(content: string): unknown;
	stringifyYaml(content: unknown): string;
}

/** 浏览器 localStorage 读写能力 */
export interface LocalStoragePort {
	readLocalStorage(key: string): string | null;
	writeLocalStorage(key: string, value: string): void;
}

/** Obsidian 设置页导航能力 */
export interface SettingsNavigationPort {
	openSettingsTab(tabId: string): void;
}

/** Markdown 编辑器文本插入能力 */
export interface EditorInsertPort {
	insertTextIntoMarkdownEditor(content: string): EditorInsertResult;
}

/** Markdown 渲染能力 */
export interface MarkdownRenderPort {
	renderMarkdown(
		markdown: string,
		container: HTMLElement,
		sourcePath: string,
		component: unknown,
	): Promise<void>;
}

/** 内部链接跳转能力 */
export interface InternalLinkPort {
	openInternalLink(linkTarget: string, sourcePath?: string): void;
}

// ── 兼容全量接口（过渡期保留） ──────────────────────

/**
 * 所有宿主能力窄接口的联合。
 *
 * **新代码不应直接依赖此接口**——请根据实际需求声明最小 Port 组合。
 * 此接口仅为尚未迁移的 legacy 消费方保留向下兼容。
 *
 * @deprecated 新代码应依赖窄接口（如 NoticePort、VaultReadPort 等）。
 */
export interface ObsidianApiProvider extends
	NoticePort,
	VaultPathPort,
	VaultReadPort,
	VaultWritePort,
	VaultWatchPort,
	HttpRequestPort,
	YamlPort,
	LocalStoragePort,
	SettingsNavigationPort,
	EditorInsertPort,
	MarkdownRenderPort,
	InternalLinkPort {}

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
	readonly json?: unknown;
	readonly arrayBuffer?: ArrayBuffer;
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

export interface EditorInsertResult {
	readonly inserted: boolean;
	readonly fileName?: string;
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
