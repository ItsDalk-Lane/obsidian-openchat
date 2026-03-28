/**
 * @module mcp/runtime/protocol-client-helpers
 * @description 提供 MCP 协议客户端的重试、错误判定与参数预览辅助函数。
 *
 * @dependencies 无
 * @side-effects createRetryDelayPromise 会调度定时器
 * @invariants 所有辅助函数都保持纯逻辑或只产生局部定时器副作用。
 */

export const MCP_PROTOCOL_VERSION = '2024-11-05'
export const MCP_TOOL_CALL_MAX_RETRIES = 2
export const MCP_TOOL_CALL_RETRY_DELAYS_MS = [600, 1500]

export class McpJsonRpcError extends Error {
	readonly code: number

	constructor(message: string, code: number) {
		super(message)
		this.name = 'McpJsonRpcError'
		this.code = code
	}
}

/** @precondition error 为任意异常值 @postcondition 返回该错误是否属于业务级 JSON-RPC 错误 @throws 从不抛出 @example isBusinessLevelMcpError(new McpJsonRpcError('bad request', 400)) */
export function isBusinessLevelMcpError(error: unknown): boolean {
	if (!(error instanceof McpJsonRpcError)) {
		return false
	}
	const code = error.code
	return (code <= -400 && code > -500) || (code >= 400 && code < 500)
}

/** @precondition error 为任意异常值 @postcondition 返回该错误是否值得按重试策略继续调用 @throws 从不抛出 @example isRetryableToolCallError(new Error('timeout')) */
export function isRetryableToolCallError(error: unknown): boolean {
	const text = (error instanceof Error ? error.message : String(error)).toLowerCase()
	const hasServerCode = /mcp 错误 \[-?5\d\d\]/i.test(text) || /\b5\d\d\b/.test(text)
	const hasTransientHint = /(timeout|timed out|temporar|try again later|service unavailable|network|fetch failed|econnreset|socket hang up)/i.test(text)
	return hasServerCode || hasTransientHint
}

/** @precondition attempt 为当前重试次数，从 0 开始 @postcondition 返回是否应该在远程 transport 上先重连再重试 @throws 从不抛出 @example shouldReconnectRemoteTransport(new Error('session reset'), 0) */
export function shouldReconnectRemoteTransport(error: unknown, attempt: number): boolean {
	if (attempt !== 0) {
		return false
	}
	const text = (error instanceof Error ? error.message : String(error)).toLowerCase()
	return isRetryableToolCallError(error)
		|| /session|expired|invalid|reset|closed|broken pipe|econnreset|socket/i.test(text)
}

/** @precondition ms 为非负延迟毫秒数 @postcondition 返回一个在 ms 后完成的 Promise @throws 从不抛出 @example await createRetryDelayPromise(600) */
export function createRetryDelayPromise(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/** @precondition args 为工具调用参数对象 @postcondition 返回适合日志展示的参数预览文本 @throws 从不抛出 @example previewProtocolClientArgs({ query: 'hello' }) */
export function previewProtocolClientArgs(args: Record<string, unknown>): string {
	try {
		const text = JSON.stringify(args)
		return text.length > 220 ? `${text.slice(0, 220)}...` : text
	} catch {
		const text = String(args)
		return text.length > 220 ? `${text.slice(0, 220)}...` : text
	}
}