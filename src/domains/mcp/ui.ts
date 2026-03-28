/**
 * @module mcp/ui
 * @description 提供外部 MCP 运行时域的控制器壳与运行时装配入口。
 *
 * @dependencies src/domains/mcp/service, src/domains/mcp/types
 * @side-effects 通过工厂创建外部 MCP 运行时实例
 * @invariants consumer 仅面向该控制器与运行时接口，不直接依赖 runtime 内核细节。
 */

import { McpDomainService } from './service';
import { McpRuntimeManagerImpl } from './runtime/runtime-manager';
import type { HttpRequestOptions, HttpResponseData } from 'src/providers/providers.types';
import type {
	McpDomainLogger,
	McpRuntimeManager,
	McpRuntimeManagerFactory,
	McpSettings,
} from './types';

/**
 * @precondition runtimeManagerFactory 由组合根提供
 * @postcondition 向 consumer 暴露稳定的 MCP 域协调器门面
 * @throws 从不抛出
 */
export class McpRuntimeCoordinator {
	private readonly service: McpDomainService;

	constructor(runtimeManagerFactory: McpRuntimeManagerFactory) {
		this.service = new McpDomainService(runtimeManagerFactory);
	}

	/** @precondition settings 可以为空或部分字段缺失 @postcondition 确保域内运行时已创建或已更新到最新设置 @throws 当底层服务失败时抛出 @example await coordinator.initialize(settings) */
	async initialize(settings?: McpSettings | null): Promise<void> {
		await this.service.initialize(settings);
	}

	/** @precondition 无 @postcondition 返回当前运行时实例或 null @throws 从不抛出 @example coordinator.getManager() */
	getManager(): McpRuntimeManager | null {
		return this.service.getManager();
	}

	/** @precondition 无 @postcondition 当前运行时被异步释放 @throws 从不抛出 @example coordinator.dispose() */
	dispose(): void {
		void this.service.dispose();
	}
}

export interface McpRuntimeFactoryDependencies {
	logger: McpDomainLogger
	notify: (message: string, timeout?: number) => void
	requestHttp: (options: HttpRequestOptions) => Promise<HttpResponseData>
}

/** @precondition dependencies 提供运行时所需宿主能力 @postcondition 返回可创建外部 MCP 运行时实例的工厂 @throws 从不抛出 @example createMcpRuntimeManagerFactory({ logger, notify, requestHttp }) */
export function createMcpRuntimeManagerFactory(
	dependencies: McpRuntimeFactoryDependencies,
): McpRuntimeManagerFactory {
	return {
		async create(settings): Promise<McpRuntimeManager> {
			return new McpRuntimeManagerImpl(settings, dependencies);
		},
	};
}