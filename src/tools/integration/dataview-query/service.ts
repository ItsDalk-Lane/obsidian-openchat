import type { App } from 'obsidian'
import { normalizeAndValidatePath } from 'src/core/services/fileOperationHelpers'
import type { BuiltinValidationResult } from '../../runtime/types'
import { normalizeFilePath } from '../../vault/_shared/path'
import type {
	DataviewQueryArgs,
	DataviewQueryResult,
} from './schema'

const DATAVIEW_PLUGIN_ID = 'dataview'
const QUERY_SUMMARY_LIMIT = 80

type DataviewEnvelope<T> =
	| {
		successful: true
		value: T
	}
	| {
		successful: false
		error: string
	}

interface DataviewStructuredValue {
	type?: unknown
	headers?: unknown
	values?: unknown
}

interface DataviewQueryApi {
	query(
		source: string,
		file?: string,
	): Promise<DataviewEnvelope<DataviewStructuredValue>>
	queryMarkdown(source: string, file?: string): Promise<DataviewEnvelope<string>>
}

interface DataviewPluginLike {
	api?: unknown
}

const truncateText = (value: string, limit: number): string => {
	if (value.length <= limit) {
		return value
	}
	if (limit <= 12) {
		return value.slice(0, limit)
	}
	return `${value.slice(0, limit - 7)}[已截断]`
}

const summarizeQueryText = (query: string): string => {
	const normalized = query.replace(/\s+/g, ' ').trim()
	return truncateText(normalized, QUERY_SUMMARY_LIMIT)
}

const normalizeOriginFilePath = (
	app: App,
	originFilePath?: string,
): string | null => {
	if (!originFilePath?.trim()) {
		return null
	}
	normalizeAndValidatePath(originFilePath)
	const normalized = normalizeFilePath(originFilePath, 'origin_file_path')
	const target = app.vault.getAbstractFileByPath(normalized)
	if (!target) {
		throw new Error(`Dataview 查询上下文文件不存在: ${normalized}`)
	}
	return normalized
}

const isDataviewApi = (value: unknown): value is DataviewQueryApi => {
	if (!value || typeof value !== 'object') {
		return false
	}
	const candidate = value as Record<string, unknown>
	return (
		typeof candidate.query === 'function'
		&& typeof candidate.queryMarkdown === 'function'
	)
}

const getDataviewApi = (app: App): DataviewQueryApi | null => {
	const plugin = app.plugins.getPlugin(DATAVIEW_PLUGIN_ID) as DataviewPluginLike | null
	return isDataviewApi(plugin?.api) ? plugin.api : null
}

const getDataviewPluginVersion = (app: App): string | null => {
	return app.plugins.manifests[DATAVIEW_PLUGIN_ID]?.version ?? null
}

const toSerializableValue = (value: unknown, depth = 0): unknown => {
	if (
		value === null
		|| typeof value === 'string'
		|| typeof value === 'number'
		|| typeof value === 'boolean'
	) {
		return value
	}
	if (typeof value === 'bigint') {
		return value.toString()
	}
	if (value instanceof Date) {
		return value.toISOString()
	}
	if (depth >= 2) {
		return String(value)
	}
	if (Array.isArray(value)) {
		return value.slice(0, 10).map((item) => toSerializableValue(item, depth + 1))
	}
	if (!value || typeof value !== 'object') {
		return String(value)
	}

	const record = value as Record<string, unknown>
	if (typeof record.path === 'string' && typeof record.subpath === 'string') {
		return `${record.path}#${record.subpath}`
	}
	if (typeof record.path === 'string') {
		return record.path
	}
	if (typeof record.toISO === 'function') {
		try {
			const iso = record.toISO()
			if (typeof iso === 'string') {
				return iso
			}
		} catch {
			return record.path ?? String(value)
		}
	}
	if (typeof record.markdown === 'function') {
		try {
			const markdown = record.markdown()
			if (typeof markdown === 'string') {
				return markdown
			}
		} catch {
			return record.path ?? String(value)
		}
	}

	const next: Record<string, unknown> = {}
	for (const [key, child] of Object.entries(record).slice(0, 10)) {
		next[key] = toSerializableValue(child, depth + 1)
	}
	return next
}

const formatPreviewCell = (value: unknown, maxCellLength: number): string => {
	const normalized = toSerializableValue(value)
	const text = typeof normalized === 'string'
		? normalized
		: JSON.stringify(normalized)
	return truncateText(text ?? String(value), maxCellLength)
}

const normalizeHeaders = (
	resultType: string,
	headers: unknown,
	maxCellLength: number,
): string[] => {
	if (Array.isArray(headers)) {
		return headers.map((header) => formatPreviewCell(header, maxCellLength))
	}
	if (resultType === 'list') {
		return ['value']
	}
	if (resultType === 'task') {
		return ['task']
	}
	return []
}

const normalizeRows = (
	resultType: string,
	values: unknown,
	maxRows: number,
	maxCellLength: number,
): {
	rowCount: number
	rows: string[][]
	truncated: boolean
} => {
	if (!Array.isArray(values)) {
		return {
			rowCount: 0,
			rows: [],
			truncated: false,
		}
	}

	const rowCount = values.length
	const sourceRows = resultType === 'table'
		? values.map((row) => Array.isArray(row) ? row : [row])
		: values.map((row) => [row])

	return {
		rowCount,
		rows: sourceRows.slice(0, maxRows).map((row) =>
			row.map((cell) => formatPreviewCell(cell, maxCellLength))
		),
		truncated: rowCount > maxRows,
	}
}

const readMarkdownPreview = async (
	api: DataviewQueryApi,
	args: DataviewQueryArgs,
	originFilePath: string | null,
): Promise<{
	markdown?: string
	truncated: boolean
	notes: string[]
}> => {
	try {
		const markdownResult = await api.queryMarkdown(args.query, originFilePath ?? undefined)
		if (!markdownResult.successful) {
			return {
				truncated: false,
				notes: [`Dataview Markdown 预览不可用：${markdownResult.error}`],
			}
		}
		return {
			markdown: truncateText(
				markdownResult.value,
				args.markdown_preview_length,
			),
			truncated: markdownResult.value.length > args.markdown_preview_length,
			notes: [],
		}
	} catch (error) {
		return {
			truncated: false,
			notes: [
				`Dataview Markdown 预览不可用：${
					error instanceof Error ? error.message : String(error)
				}`,
			],
		}
	}
}

export const hasDataviewQueryCapability = (app: App): boolean => {
	return getDataviewApi(app) !== null
}

export const validateDataviewQueryInput = (
	app: App,
	args: DataviewQueryArgs,
): BuiltinValidationResult => {
	if (!hasDataviewQueryCapability(app)) {
		return {
			ok: false,
			summary: '当前 Vault 未安装或未启用 Dataview 插件，无法执行 dataview_query。',
			notes: [
				'dataview_query 属于可选集成工具，只在 Dataview 可用时暴露。',
			],
		}
	}

	try {
		normalizeOriginFilePath(app, args.origin_file_path)
		return { ok: true }
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
			notes: [
				'当查询中使用 this 或相对路径时，建议传入真实存在的 origin_file_path。',
			],
		}
	}
}

export const summarizeDataviewQuery = (
	args: Partial<DataviewQueryArgs>,
): string | null => {
	return args.query?.trim() ? summarizeQueryText(args.query) : null
}

export const describeDataviewQueryActivity = (
	args: Partial<DataviewQueryArgs>,
): string | null => {
	if (!args.query?.trim()) {
		return null
	}
	return `执行 Dataview 查询：${summarizeQueryText(args.query)}`
}

export const executeDataviewQuery = async (
	app: App,
	args: DataviewQueryArgs,
): Promise<DataviewQueryResult> => {
	const api = getDataviewApi(app)
	if (!api) {
		throw new Error('当前 Vault 未安装或未启用 Dataview 插件，无法执行 dataview_query。')
	}

	const originFilePath = normalizeOriginFilePath(app, args.origin_file_path)
	const result = await api.query(args.query, originFilePath ?? undefined)
	if (!result.successful) {
		throw new Error(`Dataview 查询失败：${result.error}`)
	}

	const resultType = typeof result.value.type === 'string'
		? result.value.type
		: 'unknown'
	const preview = normalizeRows(
		resultType,
		result.value.values,
		args.max_rows,
		args.max_cell_length,
	)
	const markdownPreview = await readMarkdownPreview(api, args, originFilePath)
	const notes = [...markdownPreview.notes]
	if (preview.truncated) {
		notes.push(`结构化结果已截断到前 ${args.max_rows} 行。`)
	}
	if (markdownPreview.truncated) {
		notes.push(
			`Markdown 结果已截断到前 ${args.markdown_preview_length} 个字符。`,
		)
	}

	return {
		query: args.query,
		origin_file_path: originFilePath,
		plugin_version: getDataviewPluginVersion(app),
		result_type: resultType,
		row_count: preview.rowCount,
		headers: normalizeHeaders(
			resultType,
			result.value.headers,
			args.max_cell_length,
		),
		rows: preview.rows,
		markdown: markdownPreview.markdown,
		truncated: preview.truncated || markdownPreview.truncated,
		notes,
	}
}
