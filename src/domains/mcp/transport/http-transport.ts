/**
 * @module mcp/transport/http-transport
 * @description 实现基于 HTTP 的 MCP 传输层，兼容普通 JSON 响应与 SSE 响应。
 *
 * @dependencies src/domains/mcp/internal/sse-parser, src/domains/mcp/transport/remote-sse-helpers, src/providers/providers.types
 * @side-effects 发起 HTTP 请求、维护会话 ID、向上游回调消息与错误
 * @invariants transport 启动后才允许发送消息；停止时会清理会话与进行中的请求。
 */

import { feedSseChunk } from '../internal/sse-parser'
import type { McpTransportDependencies } from './transport-factory'
import type { ITransport, JsonRpcMessage, JsonRpcResponse } from './transport.types'
import { isJsonRpcLike } from './remote-sse-helpers'
import { isJsonRpcRequest } from './transport.types'

export interface HttpTransportConfig {
	url: string
	headers?: Record<string, string>
	timeout: number
}

export class HttpTransport implements ITransport {
	private started = false
	private inFlightRequests = new Set<symbol>()
	private sessionId: string | null = null

	onMessage: ((msg: JsonRpcMessage) => void) | null = null
	onClose: ((code: number | null) => void) | null = null
	onError: ((error: Error) => void) | null = null

	constructor(
		private readonly config: HttpTransportConfig,
		private readonly dependencies: McpTransportDependencies,
	) {}

	/** @precondition transport 尚未启动或允许幂等重入 @postcondition HTTP 传输层进入可发送状态 @throws 从不抛出 @example await transport.start() */
	async start(): Promise<void> {
		this.started = true
		this.dependencies.logger.info(`[MCP:http] 传输层已就绪: ${this.config.url}`)
	}

	/** @precondition transport 已启动 @postcondition 当前消息被异步发送到 HTTP 端点 @throws 当 transport 未启动时抛出 @example transport.send(message) */
	send(message: JsonRpcMessage): void {
		if (!this.started) {
			throw new Error('HTTP 传输层未启动，无法发送消息')
		}
		void this.sendInternal(message)
	}

	/** @precondition 无 @postcondition transport 停止、会话被清理并触发关闭回调 @throws 从不抛出 @example await transport.stop() */
	async stop(): Promise<void> {
		if (!this.started) {
			return
		}

		this.started = false
		this.inFlightRequests.clear()
		const sessionId = this.sessionId
		this.sessionId = null
		if (sessionId) {
			await this.tryDeleteSession(sessionId)
		}
		this.onClose?.(1000)
		this.dependencies.logger.info('[MCP:http] 传输层已停止')
	}

	private async sendInternal(message: JsonRpcMessage): Promise<void> {
		const token = Symbol('http-request')
		this.inFlightRequests.add(token)
		const timeoutMs = this.getTimeout()

		try {
			const response = await this.requestWithTimeout({
				url: this.config.url,
				method: 'POST',
				headers: this.buildHeaders(),
				body: JSON.stringify(message),
			}, timeoutMs)
			if (!this.started) {
				return
			}

			this.captureSessionId(response.headers)
			const responseText = typeof response.text === 'string' ? response.text : ''
			if (response.status < 200 || response.status >= 300) {
				const detail = responseText.trim().slice(0, 300)
				if (response.status === 404 && this.sessionId) {
					this.sessionId = null
				}
				this.reportError(
					message,
					new Error(detail ? `HTTP 请求失败 (${response.status}): ${detail}` : `HTTP 请求失败 (${response.status})`),
				)
				return
			}

			if (response.status === 202) {
				return
			}

			const contentType = (this.getHeaderValue(response.headers, 'content-type') ?? '').toLowerCase()
			if (contentType.includes('text/event-stream')) {
				this.consumeSseText(responseText, message)
				return
			}

			const trimmed = responseText.trim()
			if (!trimmed) {
				return
			}

			const parsed = this.tryParseJson(trimmed)
			if (!parsed) {
				this.reportError(message, new Error(`HTTP 响应解析失败: ${trimmed.slice(0, 200)}`))
				return
			}

			this.emitPayload(parsed, message)
		} catch (error) {
			if (!this.started) {
				return
			}
			const rawError = error instanceof Error ? error : new Error(String(error))
			const wrapped = rawError.message.startsWith('HTTP 请求')
				? rawError
				: new Error(`HTTP 请求失败: ${rawError.message}`)
			this.reportError(message, wrapped)
		} finally {
			this.inFlightRequests.delete(token)
		}
	}

	private consumeSseText(text: string, message: JsonRpcMessage): void {
		if (!text.trim()) {
			return
		}

		let rest = ''
		const parsed = feedSseChunk(rest, text)
		rest = parsed.rest
		for (const event of parsed.events) {
			if (event.isDone) {
				continue
			}
			if (event.parseError) {
				this.reportError(message, new Error(`SSE 事件解析失败: ${event.parseError}`))
				continue
			}
			const payload = event.json ?? this.tryParseJson(event.data.trim())
			if (!payload) {
				continue
			}
			this.emitPayload(payload, message)
		}

		if (rest.trim()) {
			const flushed = feedSseChunk(rest, '\n\n')
			for (const event of flushed.events) {
				if (event.json) {
					this.emitPayload(event.json, message)
				}
			}
		}
	}

	private emitPayload(payload: unknown, requestMessage: JsonRpcMessage): void {
		if (Array.isArray(payload)) {
			for (const item of payload) {
				if (!isJsonRpcLike(item)) {
					this.reportError(requestMessage, new Error('HTTP 响应批处理中存在无效的 JSON-RPC 消息'))
					return
				}
				this.onMessage?.(item)
			}
			return
		}

		if (!isJsonRpcLike(payload)) {
			this.reportError(requestMessage, new Error('HTTP 响应不是有效的 JSON-RPC 消息'))
			return
		}

		this.onMessage?.(payload)
	}

	private async tryDeleteSession(sessionId: string): Promise<void> {
		try {
			await this.requestWithTimeout({
				url: this.config.url,
				method: 'DELETE',
				headers: {
					Accept: 'application/json, text/event-stream',
					...(this.config.headers ?? {}),
					'Mcp-Session-Id': sessionId,
				},
			}, this.getTimeout())
		} catch (error) {
			this.dependencies.logger.debug('[MCP:http] 删除会话失败，忽略', error)
		}
	}

	private buildHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			Accept: 'application/json, text/event-stream',
			'Content-Type': 'application/json',
			...(this.config.headers ?? {}),
		}
		if (this.sessionId) {
			headers['Mcp-Session-Id'] = this.sessionId
		}
		return headers
	}

	private captureSessionId(headers: Record<string, string>): void {
		const sessionId = this.getHeaderValue(headers, 'mcp-session-id')?.trim()
		if (!sessionId) {
			return
		}
		if (this.sessionId !== sessionId) {
			this.sessionId = sessionId
			this.dependencies.logger.info(`[MCP:http] 获取会话 ID: ${sessionId}`)
		}
	}

	private reportError(message: JsonRpcMessage, error: Error): void {
		this.dependencies.logger.error('[MCP:http] 传输错误', error)
		this.onError?.(error)
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

	private getTimeout(): number {
		return this.config.timeout > 0 ? this.config.timeout : 30000
	}

	private getHeaderValue(headers: Record<string, string>, name: string): string | undefined {
		const target = name.toLowerCase()
		for (const [key, value] of Object.entries(headers)) {
			if (key.toLowerCase() === target) {
				return value
			}
		}
		return undefined
	}

	private tryParseJson(text: string): unknown | null {
		if (!text) {
			return null
		}
		try {
			return JSON.parse(text) as unknown
		} catch {
			return null
		}
	}

	private async requestWithTimeout(
		options: { url: string; method: 'POST' | 'DELETE'; headers: Record<string, string>; body?: string },
		timeoutMs: number,
	): Promise<Awaited<ReturnType<McpTransportDependencies['requestHttp']>>> {
		const runner = this.dependencies.requestHttp(options)
		return await new Promise((resolve, reject) => {
			const timeoutId = setTimeout(
				() => reject(new Error(`HTTP 请求超时 (${timeoutMs}ms): ${options.url}`)),
				timeoutMs,
			)
			runner
				.then((result) => resolve(result))
				.catch((error) => reject(error))
				.finally(() => clearTimeout(timeoutId))
		})
	}
}