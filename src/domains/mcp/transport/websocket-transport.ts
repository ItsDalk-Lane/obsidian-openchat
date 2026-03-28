/**
 * @module mcp/transport/websocket-transport
 * @description 实现基于 WebSocket 的 MCP 传输层。
 *
 * @dependencies src/domains/mcp/types, src/domains/mcp/transport/transport.types
 * @side-effects 建立 WebSocket 连接、发送消息并上报连接错误
 * @invariants 仅在 WebSocket 处于 OPEN 状态时允许发送消息。
 */

import type { McpDomainLogger } from '../types'
import type { ITransport, JsonRpcMessage } from './transport.types'

export interface WebSocketConfig {
	url: string
}

export class WebSocketTransport implements ITransport {
	private ws: WebSocket | null = null

	onMessage: ((msg: JsonRpcMessage) => void) | null = null
	onClose: ((code: number | null) => void) | null = null
	onError: ((error: Error) => void) | null = null

	constructor(
		private readonly config: WebSocketConfig,
		private readonly logger: McpDomainLogger,
	) {}

	/** @precondition config.url 为可连接 WebSocket 端点 @postcondition 连接建立并开始转发消息事件 @throws 当连接创建或建立超时时抛出 @example await transport.start() */
	async start(): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			try {
				this.ws = new WebSocket(this.config.url)
			} catch (error) {
				reject(new Error(`WebSocket 连接创建失败: ${error instanceof Error ? error.message : String(error)}`))
				return
			}
			const connectTimeout = setTimeout(() => {
				reject(new Error(`WebSocket 连接超时: ${this.config.url}`))
				this.ws?.close()
			}, 10000)
			this.ws.onopen = () => {
				clearTimeout(connectTimeout)
				this.logger.info(`[MCP:ws] 已连接到 ${this.config.url}`)
				resolve()
			}
			this.ws.onmessage = (event) => {
				const data = typeof event.data === 'string' ? event.data : ''
				if (!data) {
					return
				}
				try {
					this.onMessage?.(JSON.parse(data) as JsonRpcMessage)
				} catch {
					this.logger.warn(`[MCP:ws] 无法解析 JSON-RPC 消息: ${data.substring(0, 200)}`)
				}
			}
			this.ws.onclose = (event) => {
				clearTimeout(connectTimeout)
				this.logger.info(`[MCP:ws] 连接关闭，code=${event.code}`)
				this.ws = null
				this.onClose?.(event.code)
			}
			this.ws.onerror = (event) => {
				clearTimeout(connectTimeout)
				const error = new Error(`WebSocket 连接错误: ${this.config.url}`)
				this.logger.error('[MCP:ws] 连接错误', event)
				this.onError?.(error)
				if (this.ws?.readyState !== WebSocket.OPEN) {
					reject(error)
				}
			}
		})
	}

	/** @precondition WebSocket 已处于 OPEN 状态 @postcondition 消息被发送到远端 @throws 当连接未建立时抛出 @example transport.send(message) */
	send(message: JsonRpcMessage): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error('WebSocket 未连接，无法发送消息')
		}
		this.ws.send(JSON.stringify(message))
	}

	/** @precondition 无 @postcondition WebSocket 被关闭并释放引用 @throws 从不抛出 @example await transport.stop() */
	async stop(): Promise<void> {
		if (!this.ws) {
			return
		}

		await new Promise<void>((resolve) => {
			if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
				resolve()
				return
			}
			const closeTimeout = setTimeout(() => resolve(), 3000)
			this.ws.onclose = () => {
				clearTimeout(closeTimeout)
				this.ws = null
				resolve()
			}
			this.ws.close(1000, 'Client closing')
		})
	}
}