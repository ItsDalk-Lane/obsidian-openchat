/**
 * @module mcp/service
 * @description 承载外部 MCP 运行时域的初始化、更新与释放逻辑。
 *
 * @dependencies src/domains/mcp/types, src/domains/mcp/config
 * @side-effects 通过工厂创建外部 MCP 运行时实例
 * @invariants 不直接导入 obsidian 或 legacy 运行时实现。
 */

import { resolveMcpRuntimeSettings } from './config';
import type { McpRuntimeManager, McpRuntimeManagerFactory, McpSettings } from './types';

/**
 * @precondition runtimeManagerFactory 由组合根注入
 * @postcondition 提供外部 MCP 运行时的初始化、更新与释放入口
 * @throws 仅在底层 runtime 创建或更新失败时抛出
 */
export class McpDomainService {
	private runtimeManager: McpRuntimeManager | null = null;
	private runtimeManagerPromise: Promise<McpRuntimeManager> | null = null;

	constructor(private readonly runtimeManagerFactory: McpRuntimeManagerFactory) {}

	/** @precondition settings 可以为空或部分字段缺失 @postcondition 首次创建运行时，后续仅更新设置 @throws 当运行时创建或更新失败时抛出 @example await service.initialize({ servers: [] }) */
	async initialize(settings?: McpSettings | null): Promise<void> {
		const resolvedSettings = resolveMcpRuntimeSettings(settings);
		if (!this.runtimeManager) {
			await this.getOrCreateRuntimeManager(resolvedSettings);
			return;
		}

		await this.runtimeManager.updateSettings(resolvedSettings);
	}

	/** @precondition 无 @postcondition 返回当前已创建的运行时实例或 null @throws 从不抛出 @example service.getManager() */
	getManager(): McpRuntimeManager | null {
		return this.runtimeManager;
	}

	/** @precondition 无 @postcondition 当前运行时被安全释放且内部引用清空 @throws 当底层 dispose 失败时抛出 @example await service.dispose() */
	async dispose(): Promise<void> {
		const currentManager = this.runtimeManager;
		this.runtimeManager = null;
		this.runtimeManagerPromise = null;
		if (!currentManager) {
			return;
		}

		await currentManager.dispose();
	}

	private async getOrCreateRuntimeManager(
		settings: McpSettings,
	): Promise<McpRuntimeManager> {
		if (this.runtimeManager) {
			return this.runtimeManager;
		}

		if (!this.runtimeManagerPromise) {
			this.runtimeManagerPromise = this.runtimeManagerFactory
				.create(settings)
				.then((manager) => {
					this.runtimeManager = manager;
					return manager;
				})
				.catch((error) => {
					this.runtimeManagerPromise = null;
					throw error;
				});
		}

		return await this.runtimeManagerPromise;
	}
}