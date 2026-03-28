/**
 * @module mcp/transport/remote-sse-transport
 * @description 实现基于 Remote SSE 的 MCP 传输层，负责长连接监听与 POST 回传。
 *
 * @dependencies src/domains/mcp/internal/sse-parser, src/domains/mcp/transport/remote-sse-helpers, src/domains/mcp/transport/transport.types
 * @side-effects 发起 SSE/POST 请求、重连远端流、上报传输错误
 * @invariants 传输层停止后不会再保留活动的 SSE 或 POST 请求。
 */

import type { McpDomainLogger } from '../types'
import { feedSseChunk } from '../internal/sse-parser'
import type { ITransport, JsonRpcMessage, JsonRpcResponse } from './transport.types'
import { extractRemoteSseJsonRpcMessage, resolveRemoteSseEndpoint } from './remote-sse-helpers'
import { isJsonRpcRequest } from './transport.types'

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 10000]

export interface RemoteSseTransportConfig {
	url: string
	headers?: Record<string, string>
	timeout: number
}

export class RemoteSseTransport implements ITransport {
	private stopped = true
	private started = false
	private reconnectAttempt = 0
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null
	private sseAbortController: AbortController | null = null
	private inFlightPostRequests = new Set<AbortController>()
	private postUrl: string

	onMessage: ((msg: JsonRpcMessage) => void) | null = null
	onClose: ((code: number | null) => void) | null = null
	onError: ((error: Error) => void) | null = null

	constructor(
		private readonly config: RemoteSseTransportConfig,
		private readonly logger: McpDomainLogger,
	) {
		this.postUrl = config.url
	}

	/** @precondition transport 尚未启动或允许幂等重入 @postcondition SSE 长连接已打开并开始监听事件 @throws 当首次连接失败时抛出 @example await transport.start() */
	async start(): Promise<void> {
		if (this.started && !this.stopped) {
			return
		}
		this.started = true
		this.stopped = false
		this.reconnectAttempt = 0
		this.postUrl = this.config.url
		await this.openSseConnection(true)
	}

	/** @precondition transport 已启动且未停止 @postcondition 消息通过 POST 发送到当前 endpoint @throws 当 transport 未启动时抛出 @example transport.send(message) */
	send(message: JsonRpcMessage): void {
		if (!this.started || this.stopped) {
			throw new Error('Remote SSE 传输层未启动，无法发送消息')
		}
		void this.sendViaPost(message)
	}

	/** @precondition 无 @postcondition SSE 监听、重连定时器与 POST 请求全部被终止 @throws 从不抛出 @example await transport.stop() */
	async stop(): Promise<void> {
		if (!this.started) {
			return
		}
		this.stopped = true
		this.started = false
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}
		if (this.sseAbortController) {
			this.sseAbortController.abort()
			this.sseAbortController = null
		}
		for (const controller of this.inFlightPostRequests) {
			controller.abort()
		}
		this.inFlightPostRequests.clear()
		this.onClose?.(1000)
		this.logger.info('[MCP:remote-sse] 传输层已停止')
	}

	private async openSseConnection(isInitial: boolean): Promise<void> {
		if (this.stopped) {
			return
		}
		const controller = new AbortController()
		this.sseAbortController = controller
		const timeoutMs = this.getTimeout()
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

		try {
			this.logger.info(`[MCP:remote-sse] 正在连接 SSE: ${this.config.url}`)
			const response = await fetch(this.config.url, {
				method: 'GET',
				headers: this.buildSseHeaders(),
				signal: controller.signal,
			})
			clearTimeout(timeoutId)
			if (!response.ok) {
				const responseText = await response.text().catch(() => '')
				const detail = responseText.trim().slice(0, 300)
				throw new Error(detail ? `SSE 连接失败 (${response.status}): ${detail}` : `SSE 连接失败 (${response.status})`)
			}
			if (!response.body) {
				throw new Error('SSE 响应体不可读')
			}
			this.reconnectAttempt = 0
			this.logger.info(`[MCP:remote-sse] SSE 已连接: ${this.config.url}`)
			const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
			void this.readSseLoop(reader, controller)
		} catch (error) {
			clearTimeout(timeoutId)
			if (this.stopped) {
				return
			}
			const wrappedError = controller.signal.aborted
				? new Error(`SSE 连接超时 (${timeoutMs}ms): ${this.config.url}`)
				: new Error(`SSE 连接失败: ${error instanceof Error ? error.message : String(error)}`)
			this.reportError(wrappedError)
			if (isInitial) {
				throw wrappedError
			}
			this.scheduleReconnect()
		}
	}

	private async readSseLoop(
		reader: ReadableStreamDefaultReader<string>,
		controller: AbortController,
	): Promise<void> {
		let rest = ''
		try {
			while (!this.stopped && !controller.signal.aborted) {
				const { done, value } = await reader.read()
				if (done) {
					break
				}
				const parsed = feedSseChunk(rest, value)
				rest = parsed.rest
				for (const event of parsed.events) {
					const endpoint = resolveRemoteSseEndpoint(event, this.config.url)
					if (endpoint) {
						this.postUrl = endpoint
						this.logger.info(`[MCP:remote-sse] 更新 POST endpoint: ${this.postUrl}`)
						continue
					}
					if (event.parseError) {
						this.reportError(new Error(`SSE 消息解析失败: ${event.parseError}`))
						continue
					}
					const message = extractRemoteSseJsonRpcMessage(event)
					if (message) {
						this.onMessage?.(message)
					}
				}
			}
		} catch (error) {
			if (!this.stopped && !controller.signal.aborted) {
				this.reportError(new Error(`SSE 读取失败: ${error instanceof Error ? error.message : String(error)}`))
			}
		} finally {
			try {
				reader.releaseLock()
			} catch (error) {
				this.logger.debug('[MCP:remote-sse] 释放 reader 失败，忽略', error)
			}
			if (this.sseAbortController === controller) {
				this.sseAbortController = null
			}
			if (!this.stopped && !controller.signal.aborted) {
				this.logger.warn('[MCP:remote-sse] SSE 连接已断开，准备重连')
				this.scheduleReconnect()
			}
		}
	}

	private async sendViaPost(message: JsonRpcMessage): Promise<void> {
		const controller = new AbortController()
		this.inFlightPostRequests.add(controller)
		const timeoutMs = this.getTimeout()
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

		try {
			const response = await fetch(this.postUrl, {
				method: 'POST',
				headers: this.buildPostHeaders(),
				body: JSON.stringify(message),
				signal: controller.signal,
			})
			if (!response.ok) {
				const responseText = await response.text().catch(() => '')
				const detail = responseText.trim().slice(0, 300)
				this.reportPostError(
					message,
					new Error(detail ? `POST 请求失败 (${response.status}): ${detail}` : `POST 请求失败 (${response.status})`),
				)
				return
			}

			const responseText = (await response.text()).trim()
			if (!responseText) {
				return
			}
			const parsed = this.tryParseMessage(responseText)
			if (!parsed) {
				this.reportPostError(message, new Error(`POST 响应解析失败: ${responseText.slice(0, 200)}`))
				return
			}
			this.onMessage?.(parsed)
		} catch (error) {
			if (controller.signal.aborted && this.stopped) {
				return
			}
			const wrappedError = controller.signal.aborted
				? new Error(`POST 请求超时 (${timeoutMs}ms): ${this.postUrl}`)
				: new Error(`POST 请求失败: ${error instanceof Error ? error.message : String(error)}`)
			this.reportPostError(message, wrappedError)
		} finally {
			clearTimeout(timeoutId)
			this.inFlightPostRequests.delete(controller)
		}
	}

	private scheduleReconnect(): void {
		if (this.stopped || this.reconnectTimer) {
			return
		}
		const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)]
		this.reconnectAttempt += 1
		this.reportError(new Error(`SSE 连接断开，将在 ${delay}ms 后重连`))
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null
			if (!this.stopped) {
				void this.openSseConnection(false)
			}
		}, delay)
	}

	private reportPostError(message: JsonRpcMessage, error: Error): void {
		this.reportError(error)
		if (!isJsonRpcRequest(message)) {
			return
		}
		const response: JsonRpcResponse = {
			jsonrpc: '2.0',
			id: message.id,
			error: { code: -32000, message: error.message },
		}
		this.onMessage?.(response)
	}

	private reportError(error: Error): void {
		this.logger.error('[MCP:remote-sse] 传输错误', error)
		this.onError?.(error)
	}

	private getTimeout(): number {
		return this.config.timeout > 0 ? this.config.timeout : 30000
	}

	private buildSseHeaders(): Record<string, string> {
		return {
			Accept: 'text/event-stream',
			'Cache-Control': 'no-cache',
			...(this.config.headers ?? {}),
		}
	}

	private buildPostHeaders(): Record<string, string> {
		return {
			Accept: 'application/json, text/event-stream',
			'Content-Type': 'application/json',
			...(this.config.headers ?? {}),
		}
	}

	private tryParseMessage(text: string): JsonRpcMessage | null {
		try {
			const parsed = JSON.parse(text) as unknown
			return extractRemoteSseJsonRpcMessage({ data: text, json: parsed })
		} catch {
			return null
		}
	}
}