import { App, EventRef, normalizePath } from 'obsidian';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { SubAgentScanResult } from './types';
import { SubAgentScannerService } from './SubAgentScannerService';

type SubAgentChangeListener = (result: SubAgentScanResult) => void;

const RELOAD_DEBOUNCE_MS = 100;

export class SubAgentWatcherService {
	private readonly eventRefs: EventRef[] = [];
	private readonly listeners = new Set<SubAgentChangeListener>();
	private reloadTimer: number | null = null;
	private started = false;

	constructor(
		private readonly app: App,
		private readonly scanner: SubAgentScannerService,
	) {}

	async start(): Promise<void> {
		if (this.started) {
			return;
		}
		this.started = true;
		this.registerWatchers();
		await this.refresh();
	}

	stop(): void {
		for (const ref of this.eventRefs) {
			this.app.vault.offref(ref);
		}
		this.eventRefs.length = 0;
		if (this.reloadTimer !== null) {
			window.clearTimeout(this.reloadTimer);
			this.reloadTimer = null;
		}
		this.listeners.clear();
		this.started = false;
	}

	async refresh(): Promise<SubAgentScanResult> {
		this.scanner.clearCache();
		const result = await this.scanner.scan();
		this.emit(result);
		return result;
	}

	onChange(listener: SubAgentChangeListener): () => void {
		this.listeners.add(listener);
		const cached = this.scanner.getCachedResult();
		if (cached) {
			listener(cached);
		}
		return () => {
			this.listeners.delete(listener);
		};
	}

	private registerWatchers(): void {
		if (this.eventRefs.length > 0) {
			return;
		}

		this.eventRefs.push(
			this.app.vault.on('create', (file) => this.handleFileChange(file.path)),
			this.app.vault.on('modify', (file) => this.handleFileChange(file.path)),
			this.app.vault.on('delete', (file) => this.handleFileChange(file.path)),
			this.app.vault.on('rename', (file, oldPath) => {
				this.handleFileChange(file.path);
				this.handleFileChange(oldPath);
			}),
		);
	}

	private handleFileChange(path: string): void {
		if (!this.isSubAgentFilePath(path)) {
			return;
		}
		this.scheduleReload();
	}

	private isSubAgentFilePath(path: string): boolean {
		const normalizedPath = normalizePath(path);
		const agentsRootPath = normalizePath(this.scanner.getAgentsRootPath());
		if (!normalizedPath || !agentsRootPath) {
			return false;
		}
		if (
			normalizedPath !== agentsRootPath
			&& !normalizedPath.startsWith(`${agentsRootPath}/`)
		) {
			return false;
		}
		return normalizedPath.toLowerCase().endsWith('.md');
	}

	private scheduleReload(): void {
		if (this.reloadTimer !== null) {
			window.clearTimeout(this.reloadTimer);
		}
		this.reloadTimer = window.setTimeout(() => {
			this.reloadTimer = null;
			void this.refresh().catch((error) => {
				DebugLogger.warn('[SubAgentWatcherService] 刷新 Sub Agent 列表失败', error);
			});
		}, RELOAD_DEBOUNCE_MS);
	}

	private emit(result: SubAgentScanResult): void {
		for (const listener of this.listeners) {
			listener(result);
		}
	}
}
