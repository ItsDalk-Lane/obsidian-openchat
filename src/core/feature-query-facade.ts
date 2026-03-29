/**
 * @module core/feature-query-facade
 * @description 功能查询门面。
 *   聚合 skills / mcp / chat / tool 的查询入口，
 *   供 settings tab 等外部消费者使用。
 *   自身不持有任何初始化或生命周期逻辑。
 *
 * @dependencies src/domains/skills/*, src/domains/mcp/*, src/tools/runtime/*
 * @side-effects 无
 * @invariants 纯查询转发，不触发任何初始化或副作用。
 */

import type { ToolExecutor } from 'src/types/tool';
import type { McpRuntimeManager } from 'src/domains/mcp/types';
import type { SkillScanResult } from 'src/domains/skills/types';
import type { SkillScannerService } from 'src/domains/skills/service';
import type { ObsidianApiProvider } from 'src/providers/providers.types';
import type { SkillsRuntimeCoordinator } from 'src/domains/skills/ui';
import type { McpRuntimeCoordinator } from 'src/domains/mcp/ui';
import type { ChatFeatureManager } from 'src/core/chat/chat-feature-manager';
import { ToolExecutorRegistry } from 'src/tools/runtime/ToolExecutorRegistry';

/** 外部查询所需的内部 runtime 引用提供器 */
export interface FeatureQuerySources {
	readonly skillsRuntime: SkillsRuntimeCoordinator;
	readonly mcpRuntime: McpRuntimeCoordinator;
	readonly obsidianApiProvider: ObsidianApiProvider;
	getChatFeatureManager(): ChatFeatureManager | null;
}

export class FeatureQueryFacade {
	private readonly toolExecutorRegistry = new ToolExecutorRegistry();

	constructor(private readonly sources: FeatureQuerySources) {}

	getObsidianApiProvider(): ObsidianApiProvider {
		return this.sources.obsidianApiProvider;
	}

	getChatFeatureManager(): ChatFeatureManager | null {
		return this.sources.getChatFeatureManager();
	}

	getMcpClientManager(): McpRuntimeManager | null {
		return this.sources.mcpRuntime.getManager();
	}

	registerToolExecutor(executor: ToolExecutor): () => void {
		return this.toolExecutorRegistry.register(executor);
	}

	getCustomToolExecutors(): ToolExecutor[] {
		return this.toolExecutorRegistry.getAll();
	}

	getInstalledSkillsSnapshot(): SkillScanResult | null {
		return this.sources.skillsRuntime.getInstalledSkillsSnapshot();
	}

	getSkillScannerService(): SkillScannerService | null {
		return this.sources.skillsRuntime.getSkillScannerService();
	}

	async scanSkills(): Promise<SkillScanResult> {
		return await this.sources.skillsRuntime.scanSkills();
	}

	async refreshSkills(): Promise<SkillScanResult> {
		return await this.sources.skillsRuntime.refreshSkills();
	}

	onSkillsChange(listener: (result: SkillScanResult) => void): () => void {
		return this.sources.skillsRuntime.onSkillsChange(listener);
	}

	async refreshQuickActionsCache(): Promise<void> {
		const chatManager = this.sources.getChatFeatureManager();
		if (chatManager) {
			await chatManager.refreshQuickActionsCache();
		}
	}

	clearToolExecutors(): void {
		this.toolExecutorRegistry.clear();
	}
}
