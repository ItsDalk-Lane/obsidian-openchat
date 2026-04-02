/**
 * Agent Loop 通用类型定义
 *
 * 与 MCP 无关的工具调用循环接口，支持任意工具执行后端
 */

import type { McpToolAnnotations } from 'src/types/mcp'

export type ToolDiscoveryVisibility =
	| 'default'
	| 'candidate-only'
	| 'workflow-only'
	| 'hidden'

export type ToolArgumentComplexity = 'low' | 'medium' | 'high'

export type ToolRiskLevel =
	| 'read-only'
	| 'mutating'
	| 'destructive'
	| 'escape-hatch'

export interface ToolIdentity {
	readonly stableId: string
	readonly familyId: string
	readonly source: 'builtin' | 'mcp' | 'workflow' | 'escape-hatch' | 'custom'
	readonly sourceId: string
	readonly providerCallName: string
}

export interface ToolDiscoveryMetadata {
	readonly displayName: string
	readonly oneLinePurpose: string
	readonly whenToUse?: readonly string[]
	readonly whenNotToUse?: readonly string[]
	readonly requiredArgsSummary?: readonly string[]
	readonly riskLevel: ToolRiskLevel
	readonly argumentComplexity: ToolArgumentComplexity
	readonly discoveryVisibility: ToolDiscoveryVisibility
	readonly capabilityTags: readonly string[]
	readonly serverHint?: string
}

export interface ToolRuntimeContextDefault {
	readonly field: string
	readonly source:
		| 'active-file-path'
		| 'selected-text-file-path'
		| 'selected-text-start-line'
		| 'selected-text-line-count'
}

export interface ToolRuntimePolicy {
	readonly defaultArgs?: Record<string, unknown>
	readonly hiddenSchemaFields?: readonly string[]
	readonly validationSchema?: Record<string, unknown>
	readonly contextDefaults?: readonly ToolRuntimeContextDefault[]
}

export type ToolValidationIssueCode =
	| 'missing-required'
	| 'unknown-parameter'
	| 'type-mismatch'
	| 'invalid-enum'
	| 'array-item-type-mismatch'
	| 'mutually-exclusive'
	| 'conditional-required'
	| 'conditional-forbidden'

export interface ToolValidationIssue {
	readonly code: ToolValidationIssueCode
	readonly message: string
	readonly field?: string
	readonly relatedFields?: readonly string[]
	readonly expected?: string
	readonly actual?: string
	readonly acceptedValues?: readonly string[]
}

export type ToolRepairHintKind =
	| 'provide-parameter'
	| 'remove-parameter'
	| 'adjust-value'
	| 'retry-with-different-args'
	| 'use-fallback-tool'

export interface ToolRepairHint {
	readonly kind: ToolRepairHintKind
	readonly message: string
	readonly field?: string
	readonly suggestedValues?: readonly string[]
	readonly fallbackToolName?: string
}

export interface ToolErrorContext {
	readonly kind: 'argument-parse' | 'argument-validation'
	readonly summary: string
	readonly issues: readonly ToolValidationIssue[]
	readonly repairHints: readonly ToolRepairHint[]
	readonly notes?: readonly string[]
	readonly argumentsPreview?: string
	readonly schemaSummary?: string
}

export interface ToolCompatibilityMetadata {
	readonly version: number
	readonly legacyCallNames?: readonly string[]
	readonly legacyServerIds?: readonly string[]
	readonly nativeNamespaceHint?: string
	readonly nativeToolNameHint?: string
	readonly supportsDeferredSchema?: boolean
	readonly supportsToolSearch?: boolean
	readonly deprecationStatus?: 'active' | 'legacy' | 'deprecated'
}

/** 通用工具定义（Provider 无关） */
export interface ToolDefinition {
	readonly name: string
	readonly title?: string
	readonly description: string
	readonly inputSchema: Record<string, unknown>
	readonly outputSchema?: Record<string, unknown>
	readonly annotations?: McpToolAnnotations
	/** 工具来源标识，如 'mcp'、'builtin'、'custom' */
	readonly source: string
	/** 工具来源的唯一 ID，如 MCP 的 serverId */
	readonly sourceId: string
	readonly identity?: ToolIdentity
	readonly discovery?: ToolDiscoveryMetadata
	readonly runtimePolicy?: ToolRuntimePolicy
	readonly compatibility?: ToolCompatibilityMetadata
}

/** 模型返回的工具调用请求 */
export interface ToolCallRequest {
	readonly id: string
	readonly name: string
	readonly arguments: string
}

/** 工具执行结果 */
export interface ToolCallResult {
	readonly toolCallId: string
	readonly name: string
	readonly content: string
	readonly status?: 'completed' | 'failed'
	readonly errorContext?: ToolErrorContext
}

export interface ToolExecutionOptions {
	readonly abortSignal?: AbortSignal
}

/** 工具执行记录（用于回填到会话消息） */
export interface ToolExecutionRecord {
	readonly id: string
	readonly name: string
	readonly arguments: Record<string, unknown>
	readonly result?: string
	readonly status: 'pending' | 'completed' | 'failed'
	readonly timestamp: number
	readonly errorContext?: ToolErrorContext
}

/**
 * 工具执行器接口
 *
 * 不同的工具后端（MCP、内置工具等）实现此接口以提供工具执行能力
 */
export interface ToolExecutor {
	/**
	 * 是否处理当前工具调用；未实现时由上层作为兜底执行器使用
	 */
	canHandle?(call: ToolCallRequest, tools: ToolDefinition[]): boolean
	/**
	 * 执行单个工具调用
	 *
	 * @param call - 模型返回的工具调用请求
	 * @param tools - 当前可用工具列表（用于查找工具定义）
	 * @returns 工具执行结果
	 */
	execute(
		call: ToolCallRequest,
		tools: ToolDefinition[],
		options?: ToolExecutionOptions,
	): Promise<ToolCallResult>
}

/** 动态工具集解析函数 */
export type GetToolsFn = () => Promise<ToolDefinition[]>
