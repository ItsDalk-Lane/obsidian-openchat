import type { App } from 'obsidian'
import { normalizeAndValidatePath } from 'src/core/services/fileOperationHelpers'
import type {
	BuiltinPermissionDecision,
	BuiltinValidationResult,
} from '../../runtime/types'
import { getFileOrThrow } from '../../vault/_shared/helpers'
import { normalizeFilePath } from '../../vault/_shared/path'
import {
	applyCanvasEditOperations,
	parseCanvasDocument,
	serializeCanvasDocument,
} from '../_shared/canvas-document'
import type {
	EditCanvasArgs,
	EditCanvasOperation,
	EditCanvasResult,
} from './schema'

const normalizeCanvasPath = (filePath: string): string => {
	normalizeAndValidatePath(filePath)
	const normalized = normalizeFilePath(filePath, 'file_path')
	if (!normalized.endsWith('.canvas')) {
		throw new Error('edit_canvas 目前只支持 .canvas 文件')
	}
	return normalized
}

const normalizeEditCanvasArgs = (args: EditCanvasArgs): EditCanvasArgs => ({
	file_path: normalizeCanvasPath(args.file_path),
	operations: args.operations,
})

const isDestructiveOperation = (operation: EditCanvasOperation): boolean => (
	operation.action === 'remove_node' || operation.action === 'remove_edge'
)

export const validateEditCanvasInput = (
	args: EditCanvasArgs,
): BuiltinValidationResult => {
	try {
		normalizeEditCanvasArgs(args)
		return { ok: true }
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
			notes: ['edit_canvas 只处理 Canvas 节点、位置与连线变更，不接受原始 JSON 文本补丁。'],
		}
	}
}

export const checkEditCanvasPermissions = async (
	_app: App,
	args: EditCanvasArgs,
): Promise<BuiltinPermissionDecision<EditCanvasArgs>> => {
	const updatedArgs = normalizeEditCanvasArgs(args)
	const destructiveCount = updatedArgs.operations.filter((operation) => (
		isDestructiveOperation(operation)
	)).length
	if (destructiveCount === 0) {
		return { behavior: 'allow', updatedArgs }
	}
	return {
		behavior: 'ask',
		message: `将删除 ${updatedArgs.file_path} 中的节点或连线`,
		updatedArgs,
		escalatedRisk: 'destructive',
		confirmation: {
			title: '确认修改 Canvas',
			body: `${updatedArgs.file_path}\n删除操作数: ${destructiveCount}`,
			confirmLabel: '确认修改',
		},
	}
}

export const summarizeEditCanvas = (
	args: Partial<EditCanvasArgs>,
): string | null => {
	if (!args.file_path) {
		return null
	}
	const count = Array.isArray(args.operations) ? args.operations.length : 0
	return `${args.file_path}${count > 0 ? ` (${count} ops)` : ''}`
}

export const describeEditCanvasActivity = (
	args: Partial<EditCanvasArgs>,
): string | null => args.file_path ? `编辑 Canvas ${args.file_path}` : null

export const executeEditCanvas = async (
	app: App,
	args: EditCanvasArgs,
): Promise<EditCanvasResult> => {
	const normalized = normalizeEditCanvasArgs(args)
	const file = getFileOrThrow(app, normalized.file_path)
	const originalContent = await app.vault.cachedRead(file)
	const document = parseCanvasDocument(originalContent)
	const applied = applyCanvasEditOperations(document, normalized.operations)
	await app.vault.modify(file, serializeCanvasDocument(applied.document))
	return {
		file_path: normalized.file_path,
		operations_applied: normalized.operations.length,
		node_count: applied.document.nodes.length,
		edge_count: applied.document.edges.length,
		updated_node_ids: applied.updatedNodeIds,
		updated_edge_ids: applied.updatedEdgeIds,
		removed_node_ids: applied.removedNodeIds,
		removed_edge_ids: applied.removedEdgeIds,
		...(applied.diffLines.length > 0 ? { diff_preview: applied.diffLines.join('\n') } : {}),
	}
}

export const isDestructiveEditCanvas = (
	args: EditCanvasArgs,
): boolean => args.operations.some((operation) => isDestructiveOperation(operation))
