import type { App } from 'obsidian'
import { normalizeAndValidatePath } from 'src/core/services/fileOperationHelpers'
import type { BuiltinValidationResult } from '../../runtime/types'
import { getFileOrThrow } from '../../vault/_shared/helpers'
import { normalizeFilePath } from '../../vault/_shared/path'
import {
	buildCanvasReadModel,
	parseCanvasDocument,
} from '../_shared/canvas-document'
import type { ReadCanvasArgs, ReadCanvasResult } from './schema'

const normalizeCanvasPath = (filePath: string): string => {
	normalizeAndValidatePath(filePath)
	const normalized = normalizeFilePath(filePath, 'file_path')
	if (!normalized.endsWith('.canvas')) {
		throw new Error('read_canvas 目前只支持 .canvas 文件')
	}
	return normalized
}

export const validateReadCanvasInput = (
	args: ReadCanvasArgs,
): BuiltinValidationResult => {
	try {
		normalizeCanvasPath(args.file_path)
		return { ok: true }
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
			notes: ['read_canvas 只读取 Canvas 节点、连线和布局摘要，不修改文件。'],
		}
	}
}

export const summarizeReadCanvas = (
	args: Partial<ReadCanvasArgs>,
): string | null => args.file_path?.trim() || null

export const describeReadCanvasActivity = (
	args: Partial<ReadCanvasArgs>,
): string | null => args.file_path ? `读取 Canvas ${args.file_path}` : null

export const executeReadCanvas = async (
	app: App,
	args: ReadCanvasArgs,
): Promise<ReadCanvasResult> => {
	const filePath = normalizeCanvasPath(args.file_path)
	const file = getFileOrThrow(app, filePath)
	const content = await app.vault.cachedRead(file)
	const document = parseCanvasDocument(content)
	return {
		file_path: filePath,
		...buildCanvasReadModel(document, args.text_preview_length),
	}
}
