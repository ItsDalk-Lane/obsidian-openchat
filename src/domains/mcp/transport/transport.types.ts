/**
 * @module mcp/transport/transport.types
 * @description 定义 MCP 传输层使用的 JSON-RPC 消息与 transport 契约。
 *
 * @dependencies 无
 * @side-effects 无
 * @invariants 只暴露协议结构和 transport 接口，不包含具体传输实现。
 */

export interface JsonRpcRequest {
	jsonrpc: '2.0'
	id: number
	method: string
	params?: Record<string, unknown>
}

export interface JsonRpcResponse {
	jsonrpc: '2.0'
	id: number
	result?: unknown
	error?: { code: number; message: string; data?: unknown }
}

export interface JsonRpcNotification {
	jsonrpc: '2.0'
	method: string
	params?: Record<string, unknown>
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification

/** @precondition msg 为 JSON-RPC 消息对象 @postcondition 返回该消息是否为 JSON-RPC 响应 @throws 从不抛出 @example isJsonRpcResponse({ jsonrpc: '2.0', id: 1, result: {} }) */
export function isJsonRpcResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
	return 'id' in msg && !('method' in msg)
}

/** @precondition msg 为 JSON-RPC 消息对象 @postcondition 返回该消息是否为 JSON-RPC 请求 @throws 从不抛出 @example isJsonRpcRequest({ jsonrpc: '2.0', id: 1, method: 'ping' }) */
export function isJsonRpcRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
	return 'id' in msg && 'method' in msg
}

/** @precondition msg 为 JSON-RPC 消息对象 @postcondition 返回该消息是否为 JSON-RPC 通知 @throws 从不抛出 @example isJsonRpcNotification({ jsonrpc: '2.0', method: 'notify' }) */
export function isJsonRpcNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
	return !('id' in msg) && 'method' in msg
}

export interface ITransport {
	readonly pid?: number
	start(): Promise<void>
	send(message: JsonRpcMessage): void
	stop(): Promise<void>
	onMessage: ((msg: JsonRpcMessage) => void) | null
	onClose: ((code: number | null) => void) | null
	onError: ((error: Error) => void) | null
}