/**
 * MCP 工具参数验证与规范化辅助函数
 */

import { getBuiltinToolHint, type ToolHintCoercion } from './toolHints'

export function hasUsableValue(value: unknown): boolean {
	if (value === undefined || value === null) return false
	if (typeof value === 'string') return value.trim().length > 0
	if (Array.isArray(value)) return value.length > 0
	return true
}

export function toSnakeCaseKey(key: string): string {
	return key
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/[\s-]+/g, '_')
		.toLowerCase()
}

export function trimArgsDeep(value: unknown): unknown {
	if (typeof value === 'string') return value.trim()
	if (Array.isArray(value)) return value.map((item) => trimArgsDeep(item))
	if (!value || typeof value !== 'object') return value
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
			key,
			trimArgsDeep(nestedValue),
		]),
	)
}

export function coerceValue(value: unknown, coercion: ToolHintCoercion): unknown {
	if (coercion === 'string_array') {
		if (Array.isArray(value)) {
			return value
				.map((item) => (typeof item === 'string' ? item.trim() : item))
				.filter((item) => typeof item === 'string' && item.length > 0)
		}
		if (typeof value === 'string') {
			return value
				.split(',')
				.map((part) => part.trim())
				.filter(Boolean)
		}
		return value
	}

	if (coercion === 'boolean' && typeof value === 'string') {
		if (/^(true|false)$/i.test(value.trim())) {
			return value.trim().toLowerCase() === 'true'
		}
		return value
	}

	if ((coercion === 'number' || coercion === 'integer') && typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) return value
		const parsed = Number(trimmed)
		if (!Number.isFinite(parsed)) return value
		if (coercion === 'integer' && !Number.isInteger(parsed)) return value
		return parsed
	}

	return value
}

export function getSchemaType(propertySchema: unknown): string | null {
	if (!propertySchema || typeof propertySchema !== 'object') return null
	const type = (propertySchema as { type?: unknown }).type
	return typeof type === 'string' ? type : null
}

export function getSchemaEnum(propertySchema: unknown): string[] | null {
	if (!propertySchema || typeof propertySchema !== 'object') return null
	const enumValues = (propertySchema as { enum?: unknown }).enum
	if (!Array.isArray(enumValues)) return null
	return enumValues.filter((value): value is string => typeof value === 'string')
}

export function validateToolArgs(
	toolName: string,
	schema: Record<string, unknown> | undefined,
	args: Record<string, unknown>,
): string[] {
	if (!schema || typeof schema !== 'object') return []

	const toolHint = getBuiltinToolHint(toolName)
	const required = Array.isArray(schema.required)
		? schema.required.filter((key): key is string => typeof key === 'string')
		: []
	const properties =
		typeof schema.properties === 'object' && schema.properties !== null
			? (schema.properties as Record<string, unknown>)
			: {}

	const errors: string[] = []
	const propertyNames = new Set(Object.keys(properties))
	const shouldRejectUnknownFields = propertyNames.size > 0 || Boolean(toolHint)

	for (const key of required) {
		if (!hasUsableValue(args[key])) {
			errors.push(`缺少必填参数: ${key}`)
		}
	}

	for (const key of Object.keys(args)) {
		if (shouldRejectUnknownFields && !propertyNames.has(key)) {
			errors.push(`未知参数: ${key}`)
		}
	}

	for (const [key, value] of Object.entries(args)) {
		const propSchema = properties[key]
		if (!propSchema || typeof propSchema !== 'object') continue

		const expectedType = getSchemaType(propSchema)
		if (!expectedType) continue

		const actualType = Array.isArray(value) ? 'array' : typeof value
		const normalizedActualType =
			actualType === 'object' && value !== null ? 'object' : actualType

		const matches = (
			(expectedType === 'string' && normalizedActualType === 'string')
			|| (expectedType === 'number' && normalizedActualType === 'number')
			|| (expectedType === 'integer' && typeof value === 'number' && Number.isInteger(value))
			|| (expectedType === 'boolean' && normalizedActualType === 'boolean')
			|| (expectedType === 'array' && Array.isArray(value))
			|| (
				expectedType === 'object'
				&& normalizedActualType === 'object'
				&& value !== null
				&& !Array.isArray(value)
			)
		)

		if (!matches) {
			errors.push(`参数类型不匹配: ${key} 期望 ${expectedType}，实际 ${normalizedActualType}`)
			continue
		}

		const enumValues = getSchemaEnum(propSchema)
		if (enumValues && typeof value === 'string' && !enumValues.includes(value)) {
			errors.push(`参数取值无效: ${key} 仅接受 ${enumValues.join(', ')}`)
		}

		if (expectedType === 'array' && Array.isArray(value)) {
			const itemType = getSchemaType((propSchema as { items?: unknown }).items)
			if (itemType) {
				const hasInvalid = value.some((item) => {
					const itemActualType = Array.isArray(item) ? 'array' : typeof item
					if (itemType === 'integer') {
						return typeof item !== 'number' || !Number.isInteger(item)
					}
					return itemActualType !== itemType
				})
				if (hasInvalid) {
					errors.push(`数组参数类型不匹配: ${key} 的元素必须是 ${itemType}`)
				}
			}
		}
	}

	for (const group of toolHint?.mutuallyExclusive ?? []) {
		const activeFields = group.filter((field) => hasUsableValue(args[field]))
		if (activeFields.length > 1) {
			errors.push(`参数互斥: ${activeFields.join(', ')} 不能同时提供`)
		}
	}

	for (const rule of toolHint?.conditionalRules ?? []) {
		if (args[rule.field] !== rule.when) continue
		for (const requiredField of rule.requires ?? []) {
			if (!hasUsableValue(args[requiredField])) {
				errors.push(rule.message ?? `参数依赖: 当 ${rule.field}=${String(rule.when)} 时必须提供 ${requiredField}`)
			}
		}
		for (const forbiddenField of rule.forbids ?? []) {
			if (hasUsableValue(args[forbiddenField])) {
				errors.push(rule.message ?? `参数不兼容: 当 ${rule.field}=${String(rule.when)} 时不能提供 ${forbiddenField}`)
			}
		}
	}

	return errors
}

export function getSchemaMeta(schema: Record<string, unknown> | undefined): {
	required: string[]
	properties: Record<string, unknown>
} {
	if (!schema || typeof schema !== 'object') {
		return { required: [], properties: {} }
	}

	const required = Array.isArray(schema.required)
		? schema.required.filter((key): key is string => typeof key === 'string')
		: []
	const properties =
		typeof schema.properties === 'object' && schema.properties !== null
			? (schema.properties as Record<string, unknown>)
			: {}

	return { required, properties }
}

export function isRepoLikeKey(key: string): boolean {
	return /(repo|repository|project)/i.test(key)
}

export function isUrlLikeKey(key: string): boolean {
	return /(url|uri|link|endpoint)/i.test(key)
}

export function isGithubRepoSlug(value: string): boolean {
	return /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:\.git)?$/.test(value.trim())
}

export function isGithubUrl(value: string): boolean {
	return /^https?:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:\.git)?(?:\/.*)?$/i.test(
		value.trim(),
	)
}

export function toGithubUrl(value: string): string {
	const trimmed = value.trim().replace(/^github\.com\//i, '')
	if (isGithubUrl(trimmed)) return trimmed
	if (isGithubRepoSlug(trimmed)) return `https://github.com/${trimmed}`
	return value.trim()
}

export function toGithubSlug(value: string): string {
	const trimmed = value.trim()
	if (!isGithubUrl(trimmed)) return trimmed
	const matched = trimmed.match(/^https?:\/\/github\.com\/([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)(?:\.git)?(?:\/.*)?$/i)
	return matched ? matched[1] : trimmed
}

export function normalizeToolArgs(
	toolName: string,
	schema: Record<string, unknown> | undefined,
	rawArgs: Record<string, unknown>,
): { args: Record<string, unknown>; notes: string[] } {
	const toolHint = getBuiltinToolHint(toolName)
	const { required } = getSchemaMeta(schema)
	const notes: string[] = []
	const properties =
		schema && typeof schema === 'object' && typeof schema.properties === 'object' && schema.properties !== null
			? (schema.properties as Record<string, unknown>)
			: {}
	const aliasMap = toolHint?.aliases ?? {}
	let preNormalized = trimArgsDeep(rawArgs) as Record<string, unknown>

	if (toolHint?.normalize) {
		const normalizedByHint = toolHint.normalize(preNormalized)
		preNormalized = normalizedByHint.args
		notes.push(...normalizedByHint.notes)
	}

	const normalized: Record<string, unknown> = {}

	for (const [rawKey, value] of Object.entries(preNormalized)) {
		if (value === undefined) continue
		const aliasTarget = aliasMap[rawKey]
		const snakeKey = toSnakeCaseKey(rawKey)
		const canonicalKey =
			aliasTarget
			|| (rawKey in properties ? rawKey : undefined)
			|| (snakeKey in properties ? snakeKey : undefined)
			|| rawKey
		if (canonicalKey !== rawKey) {
			notes.push(`已将 ${rawKey} 映射为 ${canonicalKey}`)
		}
		if (!(canonicalKey in normalized) || !hasUsableValue(normalized[canonicalKey])) {
			normalized[canonicalKey] = value
		}
	}

	for (const [key, value] of Object.entries(normalized)) {
		const coercion =
			toolHint?.valueCoercions?.[key]
			|| ((): ToolHintCoercion | undefined => {
				const propSchema = properties[key]
				const schemaType = getSchemaType(propSchema)
				if (schemaType === 'integer') return 'integer'
				if (schemaType === 'number') return 'number'
				if (schemaType === 'boolean') return 'boolean'
				if (
					schemaType === 'array'
					&& getSchemaType((propSchema as { items?: unknown }).items) === 'string'
				) {
					return 'string_array'
				}
				return undefined
			})()
		if (coercion) {
			const next = coerceValue(value, coercion)
			if (next !== value) {
				normalized[key] = next
				notes.push(`${key}: 已自动转换为 ${coercion}`)
			}
		}

		if (typeof value !== 'string' || !value) continue

		if (isUrlLikeKey(key) || (isRepoLikeKey(key) && /url|uri/i.test(key))) {
			const next = toGithubUrl(value)
			if (next !== value) {
				normalized[key] = next
				notes.push(`${key}: repo 标识已转为 URL`)
			}
			continue
		}

		if (isRepoLikeKey(key) && !isUrlLikeKey(key) && isGithubUrl(value)) {
			const next = toGithubSlug(value)
			if (next !== value) {
				normalized[key] = next
				notes.push(`${key}: GitHub URL 已转为 owner/repo`)
			}
		}
	}

	const missingRequired = required.filter((key) => {
		const val = normalized[key]
		return val === undefined || val === null || (typeof val === 'string' && !val.trim())
	})

	if (missingRequired.length === 1) {
		const targetKey = missingRequired[0]
		const aliases = Object.entries(normalized).filter(([key, val]) => {
			if (typeof val !== 'string' || !val.trim()) return false
			if (key === targetKey) return false

			if (isUrlLikeKey(targetKey)) {
				return isRepoLikeKey(key) || isUrlLikeKey(key)
			}
			if (isRepoLikeKey(targetKey)) {
				return isRepoLikeKey(key) || isUrlLikeKey(key)
			}
			return false
		})

		if (aliases.length > 0) {
			const aliasVal = aliases[0][1] as string
			normalized[targetKey] = isUrlLikeKey(targetKey) ? toGithubUrl(aliasVal) : aliasVal
			notes.push(`已将 ${aliases[0][0]} 映射为必填字段 ${targetKey}`)
		} else {
			const stringValues = Object.values(normalized).filter(
				(v): v is string => typeof v === 'string' && !!v.trim(),
			)
			if (stringValues.length === 1) {
				normalized[targetKey] = isUrlLikeKey(targetKey)
					? toGithubUrl(stringValues[0])
					: stringValues[0]
				notes.push(`已将唯一字符串参数映射为必填字段 ${targetKey}`)
			}
		}
	}

	return { args: normalized, notes }
}
