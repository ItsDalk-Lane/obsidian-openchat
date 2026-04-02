/**
 * MCP 工具调用内部辅助函数：参数候选构建、错误跟踪、恢复提示
 */

import { getBuiltinToolHint } from './toolHints'
import { getSchemaMeta } from './mcpToolArgHelpers'

export interface ToolFailureTrackerEntry {
	count: number
	lastContent: string
}

export type ToolFailureTracker = Map<string, ToolFailureTrackerEntry>

export function maybeBuildAlternateArgsForServerError(
	schema: Record<string, unknown> | undefined,
	args: Record<string, unknown>,
): Record<string, unknown> | null {
	const { required } = getSchemaMeta(schema)
	if (required.length !== 1) return null

	const key = required[0]
	const current = args[key]
	if (typeof current !== 'string' || !current.trim()) return null

	if (isUrlLikeKey(key) && isGithubRepoSlug(current)) {
		return { ...args, [key]: toGithubUrl(current) }
	}

	if (isRepoLikeKey(key) && !isUrlLikeKey(key) && isGithubUrl(current)) {
		return { ...args, [key]: toGithubSlug(current) }
	}

	return null
}

export function getNonEmptyString(value: unknown): string | null {
	if (typeof value !== 'string') return null
	const trimmed = value.trim()
	return trimmed ? trimmed : null
}

export function extractRepoHints(args: Record<string, unknown>): {
	owner?: string
	repoName?: string
	slug?: string
	url?: string
} {
	const owner =
		getNonEmptyString(args.owner)
		?? getNonEmptyString(args.repo_owner)
		?? getNonEmptyString(args.org)
		?? getNonEmptyString(args.organization)
		?? undefined
	const repoName =
		getNonEmptyString(args.repo)
		?? getNonEmptyString(args.repository)
		?? getNonEmptyString(args.repo_name)
		?? getNonEmptyString(args.name)
		?? undefined

	let slug: string | undefined
	let url: string | undefined

	for (const [key, val] of Object.entries(args)) {
		if (typeof val !== 'string') continue
		const text = val.trim()
		if (!text) continue
		if (isGithubUrl(text) && !url) {
			url = text
			if (!slug) slug = toGithubSlug(text)
		}
		if ((isRepoLikeKey(key) || isUrlLikeKey(key)) && isGithubRepoSlug(text) && !slug) {
			slug = text.replace(/\.git$/i, '')
		}
	}

	if (!slug && owner && repoName) {
		slug = `${owner}/${repoName}`.replace(/\.git$/i, '')
	}
	if (!url && slug) {
		url = toGithubUrl(slug)
	}

	return { owner, repoName, slug, url }
}

export function safeJsonPreview(value: unknown, maxLen = 400): string {
	try {
		const text = JSON.stringify(value)
		return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text
	} catch {
		const text = String(value)
		return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text
	}
}

export function buildToolArgCandidates(
	toolName: string,
	schema: Record<string, unknown> | undefined,
	args: Record<string, unknown>,
): Record<string, unknown>[] {
	void toolName
	void schema
	return [args]
}

export function isRecoverableServerToolError(err: unknown): boolean {
	const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
	return (
		/\bmcp 错误 \[-?5\d\d\]/i.test(msg) ||
		/\b5\d\d\b/.test(msg) ||
		/(unexpected system error|internal server error|try again later)/i.test(msg)
	)
}

export function stableToolValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => stableToolValue(item))
	}
	if (!value || typeof value !== 'object') {
		return value
	}

	return Object.keys(value as Record<string, unknown>)
		.sort()
		.reduce<Record<string, unknown>>((acc, key) => {
			acc[key] = stableToolValue((value as Record<string, unknown>)[key])
			return acc
		}, {})
}

export function buildToolFailureSignature(toolName: string, args: Record<string, unknown>): string {
	return `${toolName}:${JSON.stringify(stableToolValue(args))}`
}

export function isToolFailureContent(content: string): boolean {
	const trimmed = content.trim()
	return trimmed.startsWith('工具调用失败:') || trimmed.startsWith('[工具执行错误]')
}

export function recordToolFailure(
	failureTracker: ToolFailureTracker | undefined,
	signature: string,
	content: string,
): ToolFailureTrackerEntry | null {
	if (!failureTracker) return null
	const previous = failureTracker.get(signature)
	const next: ToolFailureTrackerEntry = {
		count: (previous?.count ?? 0) + 1,
		lastContent: content,
	}
	failureTracker.set(signature, next)
	return next
}

export function clearToolFailure(
	failureTracker: ToolFailureTracker | undefined,
	signature: string,
): void {
	failureTracker?.delete(signature)
}

export function getToolFailure(
	failureTracker: ToolFailureTracker | undefined,
	signature: string,
): ToolFailureTrackerEntry | undefined {
	return failureTracker?.get(signature)
}

export function summarizeSchema(schema: Record<string, unknown> | undefined): string {
	const { required, properties } = getSchemaMeta(schema)
	const propSummary = Object.entries(properties)
		.slice(0, 8)
		.map(([name, def]) => {
			const type = (def as { type?: unknown })?.type
			return `${name}:${typeof type === 'string' ? type : 'any'}`
		})
		.join(', ')
	return `required=[${required.join(', ')}], props=[${propSummary}]`
}

export function buildToolRecoveryHint(toolName: string): string {
	const toolHint = getBuiltinToolHint(toolName)
	const parts: string[] = []
	if (toolHint?.usageHint) {
		parts.push(`使用建议=${toolHint.usageHint}`)
	}
	if (toolHint?.fallbackTool) {
		parts.push(`如果当前工具不适合，请改用 ${toolHint.fallbackTool}`)
	}
	return parts.join('。')
}
