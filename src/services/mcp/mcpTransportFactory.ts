import type { McpServerConfig } from './types'
import type { ITransport } from './transport/ITransport'
import { StdioTransport } from './transport/StdioTransport'
import { WebSocketTransport } from './transport/WebSocketTransport'
import { HttpTransport } from './transport/HttpTransport'
import { RemoteSseTransport } from './transport/RemoteSseTransport'

/**
 * 根据 MCP 服务器配置创建对应的传输层实例
 */
export function createMcpTransport(config: McpServerConfig): ITransport {
	switch (config.transportType) {
	case 'stdio':
	case 'sse': // legacy: 兼容旧配置，继续使用本地 stdio 传输
		if (!config.command) {
			throw new Error(`MCP 服务器 "${config.name}" 未配置启动命令`)
		}
		return new StdioTransport({
			command: config.command,
			args: config.args ?? [],
			env: config.env,
			cwd: config.cwd,
		})
	case 'websocket':
		if (!config.url) {
			throw new Error(`MCP 服务器 "${config.name}" 未配置 WebSocket URL`)
		}
		return new WebSocketTransport({ url: config.url })
	case 'http':
		if (!config.url) {
			throw new Error(`MCP 服务器 "${config.name}" 未配置 HTTP URL`)
		}
		return new HttpTransport({
			url: config.url,
			headers: config.headers,
			timeout: config.timeout,
		})
	case 'remote-sse':
		if (!config.url) {
			throw new Error(`MCP 服务器 "${config.name}" 未配置 Remote SSE URL`)
		}
		return new RemoteSseTransport({
			url: config.url,
			headers: config.headers,
			timeout: config.timeout,
		})
	default:
		throw new Error(`不支持的传输类型: ${config.transportType}`)
	}
}

/**
 * 判断是否为远程传输类型（支持会话重连）
 */
export function isMcpRemoteTransport(config: McpServerConfig): boolean {
	return (
		config.transportType === 'http'
		|| config.transportType === 'remote-sse'
		|| config.transportType === 'websocket'
	)
}
