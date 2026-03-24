import { App } from 'obsidian';
import type { SkillScanResult } from './types';
import { SkillScannerService } from './SkillScannerService';
import { SkillWatcherService } from './SkillWatcherService';

interface SkillsRuntimeCoordinatorOptions {
	getAiDataFolder: () => string;
}

export class SkillsRuntimeCoordinator {
	private skillScannerService: SkillScannerService | null = null;
	private skillWatcherService: SkillWatcherService | null = null;
	private initializePromise: Promise<void> | null = null;
	private readonly pendingListeners = new Set<(result: SkillScanResult) => void>();
	private readonly pendingListenerUnsubscribers = new Map<
		(result: SkillScanResult) => void,
		() => void
	>();

	constructor(
		private readonly app: App,
		private readonly options: SkillsRuntimeCoordinatorOptions,
	) {}

	async initialize(): Promise<void> {
		if (!this.initializePromise) {
			this.initializePromise = this.doInitialize().finally(() => {
				this.initializePromise = null;
			});
		}

		await this.initializePromise;
	}

	getInstalledSkillsSnapshot(): SkillScanResult | null {
		return this.skillScannerService?.getCachedResult() ?? null;
	}

	getSkillScannerService(): SkillScannerService | null {
		return this.skillScannerService;
	}

	getSkillWatcherService(): SkillWatcherService | null {
		return this.skillWatcherService;
	}

	async scanSkills(): Promise<SkillScanResult> {
		await this.initialize();
		if (!this.skillScannerService) {
			return { skills: [], errors: [] };
		}

		return await this.skillScannerService.scan();
	}

	async refreshSkills(): Promise<SkillScanResult> {
		await this.initialize();
		if (!this.skillWatcherService) {
			return { skills: [], errors: [] };
		}

		return await this.skillWatcherService.refresh();
	}

	onSkillsChange(listener: (result: SkillScanResult) => void): () => void {
		if (this.skillWatcherService) {
			return this.skillWatcherService.onChange(listener);
		}

		this.pendingListeners.add(listener);

		const cached = this.skillScannerService?.getCachedResult();
		if (cached) {
			listener(cached);
		}

		return () => {
			const unsubscribe = this.pendingListenerUnsubscribers.get(listener);
			unsubscribe?.();
			this.pendingListenerUnsubscribers.delete(listener);
			this.pendingListeners.delete(listener);
		};
	}

	dispose(): void {
		for (const unsubscribe of this.pendingListenerUnsubscribers.values()) {
			unsubscribe();
		}
		this.pendingListenerUnsubscribers.clear();
		this.pendingListeners.clear();
		this.skillWatcherService?.stop();
		this.skillWatcherService = null;
		this.skillScannerService?.clearCache();
		this.skillScannerService = null;
	}

	private async doInitialize(): Promise<void> {
		if (!this.skillWatcherService) {
			this.skillWatcherService = new SkillWatcherService(
				this.app,
				this.ensureScannerService(),
			);
			this.bindPendingListeners(this.skillWatcherService);
			await this.skillWatcherService.start();
			return;
		}

		await this.skillWatcherService.refresh();
	}

	private ensureScannerService(): SkillScannerService {
		if (!this.skillScannerService) {
			this.skillScannerService = new SkillScannerService(this.app, {
				getAiDataFolder: this.options.getAiDataFolder,
			});
		}

		return this.skillScannerService;
	}

	private bindPendingListeners(skillWatcherService: SkillWatcherService): void {
		for (const listener of this.pendingListeners) {
			if (this.pendingListenerUnsubscribers.has(listener)) {
				continue;
			}

			this.pendingListenerUnsubscribers.set(
				listener,
				skillWatcherService.onChange(listener),
			);
		}
	}
}