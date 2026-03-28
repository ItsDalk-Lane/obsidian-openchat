/**
 * @module mcp/transport/remote-sse-helpers
 * @description 提供 Remote SSE 传输层的 endpoint 与 JSON-RPC 消息解析辅助逻辑。
 *
 * @dependencies src/domains/mcp/internal/sse-parser, src/domains/mcp/transport/transport.types
 * @side-effects 无
 * @invariants 所有辅助函数都保持纯逻辑且不依赖具体 transport 实例。
 */

import type { ParsedSseEvent } from '../internal/sse-parser'
import type { JsonRpcMessage } from './transport.types'

/** @precondition event 来自已解析的 SSE 事件 @postcondition 返回远端声明的 POST endpoint 或 null @throws 从不抛出 @example resolveRemoteSseEndpoint({ event: 'endpoint', data: '/mcp', raw: '', isDone: false }, 'https://example.com/sse') */
export function resolveRemoteSseEndpoint(
	event: ParsedSseEvent,
	baseUrl: string,
): string | null {
	if (event.event !== 'endpoint') {
		return null
	}

	const raw = event.data.trim()
	if (!raw && !event.json) {
		return null
	}

	let candidate: string | null = null
	if (event.json && typeof event.json === 'object' && event.json !== null) {
		const json = event.json as { endpoint?: unknown; url?: unknown }
		if (typeof json.endpoint === 'string' && json.endpoint.trim()) {
			candidate = json.endpoint.trim()
		} else if (typeof json.url === 'string' && json.url.trim()) {
			candidate = json.url.trim()
		}
	}

	if (!candidate && raw) {
		candidate = raw
	}
	if (!candidate) {
		return null
	}

	try {
		return new URL(candidate, baseUrl).toString()
	} catch {
		return candidate
	}
}

/** @precondition value 为任意输入 @postcondition 返回该值是否形如 JSON-RPC 2.0 消息 @throws 从不抛出 @example isJsonRpcLike({ jsonrpc: '2.0', method: 'ping' }) */
export function isJsonRpcLike(value: unknown): value is JsonRpcMessage {
	return typeof value === 'object' && value !== null && (value as { jsonrpc?: unknown }).jsonrpc === '2.0'
}

/** @precondition event 为已解析 SSE 事件 @postcondition 返回其中的 JSON-RPC 消息或 null @throws 从不抛出 @example extractRemoteSseJsonRpcMessage({ data: '{"jsonrpc":"2.0"}', raw: '', isDone: false }) */
export function extractRemoteSseJsonRpcMessage(event: ParsedSseEvent): JsonRpcMessage | null {
	if (event.event === 'endpoint') {
		return null
	}

	if (event.json && isJsonRpcLike(event.json)) {
		return event.json
	}

	const raw = event.data.trim()
	if (!raw || !/^[{[]/.test(raw)) {
		return null
	}

	try {
		const parsed = JSON.parse(raw) as unknown
		return isJsonRpcLike(parsed) ? parsed : null
	} catch {
		return null
	}
}