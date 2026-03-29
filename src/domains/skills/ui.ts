/**
 * @module skills/ui
 * @description 提供 skills 域的运行时协调、监听与刷新接缝。
 *
 * @dependencies src/domains/skills/types, src/domains/skills/config, src/domains/skills/service, src/providers/providers.types
 * @side-effects 注册 Vault 监听器、调度防抖刷新
 * @invariants 不直接导入 obsidian，不向外暴露 App 实例。
 */

import { SKILL_FILE_NAME, SKILL_RELOAD_DEBOUNCE_MS } from './config';
import { SkillScannerService } from './service';
import type { SkillScannerHostPort } from './service';
import type { SkillChangeListener, SkillsDomainLogger, SkillScanResult } from './types';
import type { VaultWatchPort } from 'src/providers/providers.types';

/** SkillsRuntimeCoordinator 所需的最小宿主能力 */
export type SkillsRuntimeHostPort = SkillScannerHostPort & VaultWatchPort;

interface SkillsRuntimeCoordinatorOptions {
	getAiDataFolder: () => string;
	logger?: SkillsDomainLogger;
}

/**
 * @precondition obsidianApi 与 getAiDataFolder 由组合根注入
 * @postcondition 负责 skills 域初始化、监听刷新与对外广播结果
 * @throws 从不抛出
 */
export class SkillsRuntimeCoordinator {
	private readonly skillScannerService: SkillScannerService;
	private readonly listeners = new Set<SkillChangeListener>();
	private initializePromise: Promise<void> | null = null;
	private stopVaultWatch: (() => void) | null = null;
	private reloadTimer: ReturnType<typeof setTimeout> | null = null;
	private started = false;

	constructor(
		private readonly obsidianApi: SkillsRuntimeHostPort,
		private readonly options: SkillsRuntimeCoordinatorOptions,
	) {
		this.skillScannerService = new SkillScannerService(this.obsidianApi, this.options);
	}

	/** @precondition provider 可注册 Vault 监听 @postcondition skills 域完成首次刷新与监听注册 @throws 当首次扫描失败时抛出 @example await runtime.initialize() */
	async initialize(): Promise<void> {
		if (!this.initializePromise) {
			this.initializePromise = this.doInitialize().finally(() => {
				this.initializePromise = null;
			});
		}
		await this.initializePromise;
	}

	/** @precondition 无 @postcondition 返回当前缓存的技能快照，没有缓存时返回 null @throws 从不抛出 @example runtime.getInstalledSkillsSnapshot() */
	getInstalledSkillsSnapshot(): SkillScanResult | null {
		return this.skillScannerService.getCachedResult();
	}

	/** @precondition 无 @postcondition 返回内部复用的 SkillScannerService 实例 @throws 从不抛出 @example runtime.getSkillScannerService() */
	getSkillScannerService(): SkillScannerService {
		return this.skillScannerService;
	}

	/** @precondition runtime 可正常初始化 @postcondition 返回当前扫描结果并确保已完成初始化 @throws 初始化或扫描失败时抛出 @example await runtime.scanSkills() */
	async scanSkills(): Promise<SkillScanResult> {
		await this.initialize();
		return await this.skillScannerService.scan();
	}

	/** @precondition runtime 可正常初始化 @postcondition 强制清缓存并返回新的扫描结果 @throws 刷新失败时抛出 @example await runtime.refreshSkills() */
	async refreshSkills(): Promise<SkillScanResult> {
		await this.initialize();
		return await this.refreshNow();
	}

	/** @precondition listener 为幂等或可重复调用的订阅函数 @postcondition 返回可注销该订阅的函数 @throws 从不抛出 @example const off = runtime.onSkillsChange(listener) */
	onSkillsChange(listener: SkillChangeListener): () => void {
		this.listeners.add(listener);
		const cached = this.skillScannerService.getCachedResult();
		if (cached) {
			listener(cached);
		}
		return () => {
			this.listeners.delete(listener);
		};
	}

	/** @precondition 无 @postcondition 监听器、定时器与缓存全部清理完毕 @throws 从不抛出 @example runtime.dispose() */
	dispose(): void {
		this.stopVaultWatch?.();
		this.stopVaultWatch = null;
		if (this.reloadTimer !== null) {
			clearTimeout(this.reloadTimer);
			this.reloadTimer = null;
		}
		this.listeners.clear();
		this.skillScannerService.clearCache();
		this.started = false;
	}

	private async doInitialize(): Promise<void> {
		if (!this.started) {
			this.started = true;
			this.stopVaultWatch = this.obsidianApi.onVaultChange((event) => {
				if (this.isSkillFilePath(event.path) || (event.oldPath && this.isSkillFilePath(event.oldPath))) {
					this.scheduleReload();
				}
			});
		}
		await this.refreshNow();
	}

	private async refreshNow(): Promise<SkillScanResult> {
		this.skillScannerService.clearCache();
		const result = await this.skillScannerService.scan();
		for (const listener of this.listeners) {
			listener(result);
		}
		return result;
	}

	private isSkillFilePath(path: string): boolean {
		const normalizedPath = this.obsidianApi.normalizePath(path);
		const skillsRootPath = this.obsidianApi.normalizePath(this.skillScannerService.getSkillsRootPath());
		if (!normalizedPath || !skillsRootPath) {
			return false;
		}
		if (normalizedPath !== skillsRootPath && !normalizedPath.startsWith(`${skillsRootPath}/`)) {
			return false;
		}
		return normalizedPath.endsWith(`/${SKILL_FILE_NAME}`);
	}

	private scheduleReload(): void {
		if (this.reloadTimer !== null) {
			clearTimeout(this.reloadTimer);
		}
		this.reloadTimer = setTimeout(() => {
			this.reloadTimer = null;
			void this.refreshNow().catch((error) => {
				this.options.logger?.warn('[SkillsDomain] 刷新 Skill 列表失败', error);
			});
		}, SKILL_RELOAD_DEBOUNCE_MS);
	}
}