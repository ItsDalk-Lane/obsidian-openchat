import { App, EventRef, normalizePath } from 'obsidian';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { SkillScanResult } from './types';
import { SkillScannerService } from './SkillScannerService';

type SkillChangeListener = (result: SkillScanResult) => void;

const SKILL_FILE_NAME = 'SKILL.md';
const RELOAD_DEBOUNCE_MS = 100;

export class SkillWatcherService {
	private readonly eventRefs: EventRef[] = [];
	private readonly listeners = new Set<SkillChangeListener>();
	private reloadTimer: number | null = null;
	private started = false;

	constructor(
		private readonly app: App,
		private readonly scanner: SkillScannerService,
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

	async refresh(): Promise<SkillScanResult> {
		this.scanner.clearCache();
		const result = await this.scanner.scan();
		this.emit(result);
		return result;
	}

	onChange(listener: SkillChangeListener): () => void {
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
		if (!this.isSkillFilePath(path)) {
			return;
		}
		this.scheduleReload();
	}

	private isSkillFilePath(path: string): boolean {
		const normalizedPath = normalizePath(path);
		const skillsRootPath = normalizePath(this.scanner.getSkillsRootPath());
		if (!normalizedPath || !skillsRootPath) {
			return false;
		}
		if (
			normalizedPath !== skillsRootPath
			&& !normalizedPath.startsWith(`${skillsRootPath}/`)
		) {
			return false;
		}
		return normalizedPath.endsWith(`/${SKILL_FILE_NAME}`);
	}

	private scheduleReload(): void {
		if (this.reloadTimer !== null) {
			window.clearTimeout(this.reloadTimer);
		}
		this.reloadTimer = window.setTimeout(() => {
			this.reloadTimer = null;
			void this.refresh().catch((error) => {
				DebugLogger.warn('[SkillWatcherService] 刷新 Skill 列表失败', error);
			});
		}, RELOAD_DEBOUNCE_MS);
	}

	private emit(result: SkillScanResult): void {
		for (const listener of this.listeners) {
			listener(result);
		}
	}
}
