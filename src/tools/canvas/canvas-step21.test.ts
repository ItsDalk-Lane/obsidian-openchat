import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
	applyCanvasEditOperations,
	buildCanvasReadModel,
	parseCanvasDocument,
	serializeCanvasDocument,
} from './_shared/canvas-document'
import {
	editCanvasResultSchema,
	editCanvasSchema,
} from './edit-canvas/schema'
import {
	readCanvasResultSchema,
	readCanvasSchema,
} from './read-canvas/schema'

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url))

const readCanvasSource = async (relativePath: string): Promise<string> => {
	return await readFile(resolve(CURRENT_DIR, relativePath), 'utf8')
}

const SAMPLE_CANVAS = JSON.stringify({
	nodes: [
		{
			id: 'text-1',
			type: 'text',
			x: 10,
			y: 20,
			width: 300,
			height: 120,
			text: 'Project kickoff notes',
		},
		{
			id: 'file-1',
			type: 'file',
			x: 420,
			y: 40,
			width: 260,
			height: 120,
			file: 'notes/spec.md',
		},
	],
	edges: [
		{
			id: 'edge-1',
			fromNode: 'text-1',
			toNode: 'file-1',
			fromSide: 'right',
			toSide: 'left',
			label: 'references',
		},
	],
}, null, 2)

test('Step 21 schema 保持 read_canvas 与 edit_canvas 的读写分离边界', () => {
	const readArgs = readCanvasSchema.parse({
		file_path: 'boards/project.canvas',
	})
	const editArgs = editCanvasSchema.parse({
		file_path: 'boards/project.canvas',
		operations: [
			{
				action: 'move_node',
				node_id: 'text-1',
				x: 100,
				y: 200,
			},
		],
	})

	assert.equal(readArgs.text_preview_length, 120)
	assert.equal(editArgs.operations.length, 1)
	assert.deepEqual(Object.keys(readCanvasResultSchema.shape).sort(), [
		'edges',
		'file_path',
		'nodes',
		'summary',
	])
	assert.deepEqual(Object.keys(editCanvasResultSchema.shape).sort(), [
		'diff_preview',
		'edge_count',
		'file_path',
		'node_count',
		'operations_applied',
		'removed_edge_ids',
		'removed_node_ids',
		'updated_edge_ids',
		'updated_node_ids',
	])
})

test('Step 21 纯 helper 会读取 Canvas 摘要，并结构化应用节点与连线变更', () => {
	const document = parseCanvasDocument(SAMPLE_CANVAS)
	const readModel = buildCanvasReadModel(document, 80)
	const edited = applyCanvasEditOperations(document, [
		{
			action: 'move_node',
			node_id: 'text-1',
			x: 120,
			y: 240,
		},
		{
			action: 'add_node',
			node: {
				id: 'link-1',
				type: 'link',
				x: 760,
				y: 60,
				width: 220,
				height: 120,
				url: 'https://example.com',
			},
		},
		{
			action: 'add_edge',
			edge: {
				id: 'edge-2',
				from_node: 'file-1',
				to_node: 'link-1',
				from_side: 'right',
				to_side: 'left',
			},
		},
		{
			action: 'remove_edge',
			edge_id: 'edge-1',
		},
	])

	assert.equal(readModel.summary.node_count, 2)
	assert.equal(readModel.summary.edge_count, 1)
	assert.equal(readModel.summary.node_types.text, 1)
	assert.equal(readModel.summary.node_types.file, 1)
	assert.equal(readModel.nodes[0]?.label, 'Project kickoff notes')
	assert.equal(edited.document.nodes.length, 3)
	assert.equal(edited.document.edges.length, 1)
	assert.deepEqual(edited.updatedNodeIds.sort(), ['link-1', 'text-1'])
	assert.deepEqual(edited.updatedEdgeIds, ['edge-2'])
	assert.deepEqual(edited.removedEdgeIds, ['edge-1'])
	assert.match(serializeCanvasDocument(edited.document), /"id": "link-1"/)
})

test('Step 21 runtime 已接入 Canvas 工具工厂，并保持 read/write 分离', async () => {
	const readToolSource = await readCanvasSource('./read-canvas/tool.ts')
	const editToolSource = await readCanvasSource('./edit-canvas/tool.ts')
	const canvasToolsSource = await readCanvasSource('./canvas-tools.ts')
	const runtimeSource = await readCanvasSource('../runtime/BuiltinToolsRuntime.ts')

	assert.match(readToolSource, /READ_CANVAS_TOOL_NAME = 'read_canvas'/)
	assert.match(readToolSource, /family: 'builtin\.canvas\.read'/)
	assert.match(readToolSource, /visibility: 'candidate-only'/)
	assert.match(editToolSource, /EDIT_CANVAS_TOOL_NAME = 'edit_canvas'/)
	assert.match(editToolSource, /family: 'builtin\.canvas\.write'/)
	assert.match(editToolSource, /visibility: 'workflow-only'/)
	assert.match(canvasToolsSource, /createReadCanvasTool\(app\)/)
	assert.match(canvasToolsSource, /createEditCanvasTool\(app\)/)
	assert.match(runtimeSource, /createCanvasTools/)
	assert.match(runtimeSource, /registry\.registerAll\(createCanvasTools\(options\.app\)\)/)
})
