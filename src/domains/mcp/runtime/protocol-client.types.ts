/**
 * @module mcp/runtime/protocol-client.types
 * @description 定义 MCP 协议客户端的内部依赖与待处理请求类型。
 *
 * @dependencies src/providers/providers.types, src/domains/mcp/types
 * @side-effects 无
 * @invariants 仅承载协议客户端内部契约，不包含行为实现。
 */

import type { HttpRequestOptions, HttpResponseData } from 'src/providers/providers.types'
import type { McpDomainLogger } from '../types'

export interface PendingRequest {
	resolve: (result: unknown) => void
	reject: (error: Error) => void
	timer: ReturnType<typeof setTimeout>
}

export interface McpProtocolClientDependencies {
	logger: McpDomainLogger
	notify: (message: string, timeout?: number) => void
	requestHttp: (options: HttpRequestOptions) => Promise<HttpResponseData>
}