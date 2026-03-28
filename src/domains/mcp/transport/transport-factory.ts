/**
 * @module mcp/transport/transport-factory
 * @description 根据服务器配置选择合适的 MCP 传输层实现。
 *
 * @dependencies src/domains/mcp/types, src/domains/mcp/transport/*, src/providers/providers.types
 * @side-effects 创建传输层实例，但不主动启动连接
 * @invariants transportType 与必需字段不匹配时立即抛出清晰错误。
 */

import type { HttpRequestOptions, HttpResponseData } from 'src/providers/providers.types'
import type { McpDomainLogger, McpServerConfig } from '../types'
import type { ITransport } from './transport.types'
import { HttpTransport } from './http-transport'
import { RemoteSseTransport } from './remote-sse-transport'
import { StdioTransport } from './stdio-transport'
import { WebSocketTransport } from './websocket-transport'

export interface McpTransportDependencies {
	requestHttp: (options: HttpRequestOptions) => Promise<HttpResponseData>
	logger: McpDomainLogger
}

/** @precondition config 为合法 MCP 服务器配置 @postcondition 返回与 transportType 对应的传输层实例 @throws 当缺少必要配置或 transportType 不受支持时抛出 @example createMcpTransport(config, dependencies) */
export function createMcpTransport(
	config: McpServerConfig,
	dependencies: McpTransportDependencies,
): ITransport {
	switch (config.transportType) {
		case 'stdio':
		case 'sse':
			if (!config.command) {
				throw new Error(`MCP 服务器 "${config.name}" 未配置启动命令`)
			}
			return new StdioTransport({
				command: config.command,
				args: config.args ?? [],
				env: config.env,
				cwd: config.cwd,
			}, dependencies.logger)
		case 'websocket':
			if (!config.url) {
				throw new Error(`MCP 服务器 "${config.name}" 未配置 WebSocket URL`)
			}
			return new WebSocketTransport({ url: config.url }, dependencies.logger)
		case 'http':
			if (!config.url) {
				throw new Error(`MCP 服务器 "${config.name}" 未配置 HTTP URL`)
			}
			return new HttpTransport({
				url: config.url,
				headers: config.headers,
				timeout: config.timeout,
			}, dependencies)
		case 'remote-sse':
			if (!config.url) {
				throw new Error(`MCP 服务器 "${config.name}" 未配置 Remote SSE URL`)
			}
			return new RemoteSseTransport({
				url: config.url,
				headers: config.headers,
				timeout: config.timeout,
			}, dependencies.logger)
		default:
			throw new Error(`不支持的传输类型: ${config.transportType}`)
	}
}

/** @precondition config 为合法 MCP 服务器配置 @postcondition 返回该服务器是否使用远程传输协议 @throws 从不抛出 @example isMcpRemoteTransport(config) */
export function isMcpRemoteTransport(config: McpServerConfig): boolean {
	return (
		config.transportType === 'http'
		|| config.transportType === 'remote-sse'
		|| config.transportType === 'websocket'
	)
}