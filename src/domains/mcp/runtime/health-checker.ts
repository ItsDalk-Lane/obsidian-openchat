/**
 * @module mcp/runtime/health-checker
 * @description 负责对外部 MCP 服务器执行连接级健康检查。
 *
 * @dependencies src/domains/mcp/types, src/domains/mcp/runtime/process-manager
 * @side-effects 可能触发服务器连接，并记录健康检查日志
 * @invariants 健康检查结果始终包含响应时间与工具数量字段。
 */

import type { McpHealthResult, McpServerConfig } from '../types'
import type { McpDomainLogger } from '../types'
import { McpProcessManager } from './process-manager'

export class McpHealthChecker {
	constructor(
		private readonly processManager: McpProcessManager,
		private readonly logger: McpDomainLogger,
	) {}

	/** @precondition servers 为待检查服务器配置列表 @postcondition 返回按输入顺序生成的健康检查结果 @throws 从不抛出 @example await checker.check(servers) */
	async check(servers: McpServerConfig[]): Promise<McpHealthResult[]> {
		const results: McpHealthResult[] = []
		for (const server of servers) {
			results.push(await this.checkOne(server))
		}
		return results
	}

	/** @precondition server 为合法服务器配置 @postcondition 返回该服务器的健康检查结果 @throws 从不抛出 @example await checker.checkOne(server) */
	async checkOne(server: McpServerConfig): Promise<McpHealthResult> {
		const startTime = Date.now()
		try {
			const client = await this.processManager.ensureConnected(server)
			const result: McpHealthResult = {
				serverId: server.id,
				serverName: server.name,
				success: true,
				toolCount: client.currentTools.length,
				responseTimeMs: Date.now() - startTime,
			}
			this.logger.info(`[MCP] 健康检测通过: ${server.name}`, result)
			return result
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			const result: McpHealthResult = {
				serverId: server.id,
				serverName: server.name,
				success: false,
				toolCount: 0,
				responseTimeMs: Date.now() - startTime,
				error: message,
			}
			this.logger.error(`[MCP] 健康检测失败: ${server.name}`, error)
			return result
		}
	}
}