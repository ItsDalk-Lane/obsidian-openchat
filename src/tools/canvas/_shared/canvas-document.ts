import type {
	CanvasDocumentRecord,
	CanvasEdgeDraft,
	CanvasEdgePatch,
	CanvasEdgeRecord,
	CanvasEditApplyResult,
	CanvasEditOperationLike,
	CanvasNodeDraft,
	CanvasNodePatch,
	CanvasNodeRecord,
	CanvasNodeType,
	CanvasReadModel,
	CanvasSide,
	CanvasSummary,
	ReadCanvasEdgeView,
	ReadCanvasNodeView,
} from './canvas-document-types'

export type {
	CanvasDocumentRecord,
	CanvasEdgeDraft,
	CanvasEdgePatch,
	CanvasEdgeRecord,
	CanvasEditApplyResult,
	CanvasEditOperationLike,
	CanvasNodeDraft,
	CanvasNodePatch,
	CanvasNodeRecord,
	CanvasNodeType,
	CanvasReadModel,
	CanvasSide,
	CanvasSummary,
	ReadCanvasEdgeView,
	ReadCanvasNodeView,
}

const asRecord = (value: unknown, message: string): Record<string, unknown> => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(message)
	}
	return value as Record<string, unknown>
}

const asString = (value: unknown, message: string): string => {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(message)
	}
	return value
}

const asNumber = (value: unknown, message: string): number => {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new Error(message)
	}
	return value
}

const asStringOptional = (value: unknown): string | undefined => {
	return typeof value === 'string' && value.length > 0 ? value : undefined
}

const asObjectOptional = (value: unknown): Record<string, unknown> | undefined => {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: undefined
}

const parseCanvasNode = (value: unknown): CanvasNodeRecord => {
	const node = asRecord(value, 'Canvas 节点必须是对象')
	return {
		...node,
		id: asString(node.id, 'Canvas 节点缺少 id'),
		type: asString(node.type, 'Canvas 节点缺少 type'),
		x: asNumber(node.x, 'Canvas 节点缺少 x'),
		y: asNumber(node.y, 'Canvas 节点缺少 y'),
		width: asNumber(node.width, 'Canvas 节点缺少 width'),
		height: asNumber(node.height, 'Canvas 节点缺少 height'),
		...(asStringOptional(node.color) ? { color: asStringOptional(node.color) } : {}),
		...(asStringOptional(node.text) ? { text: asStringOptional(node.text) } : {}),
		...(asStringOptional(node.file) ? { file: asStringOptional(node.file) } : {}),
		...(asStringOptional(node.subpath) ? { subpath: asStringOptional(node.subpath) } : {}),
		...(asStringOptional(node.url) ? { url: asStringOptional(node.url) } : {}),
		...(asStringOptional(node.label) ? { label: asStringOptional(node.label) } : {}),
	}
}

const parseCanvasEdge = (value: unknown): CanvasEdgeRecord => {
	const edge = asRecord(value, 'Canvas 连线必须是对象')
	return {
		...edge,
		id: asString(edge.id, 'Canvas 连线缺少 id'),
		fromNode: asString(edge.fromNode, 'Canvas 连线缺少 fromNode'),
		toNode: asString(edge.toNode, 'Canvas 连线缺少 toNode'),
		...(asStringOptional(edge.fromSide) ? { fromSide: asStringOptional(edge.fromSide) } : {}),
		...(asStringOptional(edge.toSide) ? { toSide: asStringOptional(edge.toSide) } : {}),
		...(asStringOptional(edge.label) ? { label: asStringOptional(edge.label) } : {}),
		...(asStringOptional(edge.color) ? { color: asStringOptional(edge.color) } : {}),
	}
}

const previewText = (text: string, maxLength: number): string => {
	if (text.length <= maxLength) {
		return text
	}
	return `${text.slice(0, maxLength)}...`
}

const deriveNodeLabel = (node: CanvasNodeRecord, textPreviewLength: number): string => {
	if (typeof node.label === 'string' && node.label.trim().length > 0) {
		return node.label
	}
	if (node.type === 'text' && typeof node.text === 'string') {
		return previewText(node.text.replace(/\s+/g, ' ').trim(), textPreviewLength)
	}
	if (node.type === 'file' && typeof node.file === 'string') {
		return node.file
	}
	if (node.type === 'link' && typeof node.url === 'string') {
		return node.url
	}
	return `${node.type}:${node.id}`
}

const buildNodeView = (
	node: CanvasNodeRecord,
	textPreviewLength: number,
): ReadCanvasNodeView => ({
	id: node.id,
	type: node.type,
	x: node.x,
	y: node.y,
	width: node.width,
	height: node.height,
	label: deriveNodeLabel(node, textPreviewLength),
	...(node.color ? { color: node.color } : {}),
	...(typeof node.text === 'string'
		? { text_preview: previewText(node.text.replace(/\s+/g, ' ').trim(), textPreviewLength) }
		: {}),
	...(node.file ? { file: node.file } : {}),
	...(node.subpath ? { subpath: node.subpath } : {}),
	...(node.url ? { url: node.url } : {}),
})

const buildEdgeView = (edge: CanvasEdgeRecord): ReadCanvasEdgeView => ({
	id: edge.id,
	from_node: edge.fromNode,
	to_node: edge.toNode,
	...(edge.fromSide ? { from_side: edge.fromSide } : {}),
	...(edge.toSide ? { to_side: edge.toSide } : {}),
	...(edge.label ? { label: edge.label } : {}),
	...(edge.color ? { color: edge.color } : {}),
})

const computeBounds = (
	nodes: readonly CanvasNodeRecord[],
): CanvasSummary['bounds'] => {
	if (nodes.length === 0) {
		return null
	}
	const left = Math.min(...nodes.map((node) => node.x))
	const top = Math.min(...nodes.map((node) => node.y))
	const right = Math.max(...nodes.map((node) => node.x + node.width))
	const bottom = Math.max(...nodes.map((node) => node.y + node.height))
	return { left, top, right, bottom }
}

const countNodeTypes = (nodes: readonly CanvasNodeRecord[]): Record<string, number> => {
	return nodes.reduce<Record<string, number>>((result, node) => {
		result[node.type] = (result[node.type] ?? 0) + 1
		return result
	}, {})
}

const pushUnique = (items: string[], value: string): void => {
	if (!items.includes(value)) {
		items.push(value)
	}
}

const removeConnectedEdges = (
	document: CanvasDocumentRecord,
	nodeId: string,
	removedEdgeIds: string[],
): void => {
	document.edges = document.edges.filter((edge) => {
		const connected = edge.fromNode === nodeId || edge.toNode === nodeId
		if (connected) {
			pushUnique(removedEdgeIds, edge.id)
		}
		return !connected
	})
}

const buildNodeRecord = (node: CanvasNodeDraft): CanvasNodeRecord => ({
	id: node.id,
	type: node.type,
	x: node.x,
	y: node.y,
	width: node.width,
	height: node.height,
	...(node.color ? { color: node.color } : {}),
	...(node.text ? { text: node.text } : {}),
	...(node.file ? { file: node.file } : {}),
	...(node.subpath ? { subpath: node.subpath } : {}),
	...(node.url ? { url: node.url } : {}),
	...(node.label ? { label: node.label } : {}),
	...(asObjectOptional(node.custom_data) ?? {}),
})

const buildEdgeRecord = (edge: CanvasEdgeDraft): CanvasEdgeRecord => ({
	id: edge.id,
	fromNode: edge.from_node,
	toNode: edge.to_node,
	...(edge.from_side ? { fromSide: edge.from_side } : {}),
	...(edge.to_side ? { toSide: edge.to_side } : {}),
	...(edge.label ? { label: edge.label } : {}),
	...(edge.color ? { color: edge.color } : {}),
	...(asObjectOptional(edge.custom_data) ?? {}),
})

const updateNodeRecord = (
	node: CanvasNodeRecord,
	patch: CanvasNodePatch,
): CanvasNodeRecord => ({
	...node,
	...(patch.x !== undefined ? { x: patch.x } : {}),
	...(patch.y !== undefined ? { y: patch.y } : {}),
	...(patch.width !== undefined ? { width: patch.width } : {}),
	...(patch.height !== undefined ? { height: patch.height } : {}),
	...(patch.color !== undefined ? { color: patch.color } : {}),
	...(patch.text !== undefined ? { text: patch.text } : {}),
	...(patch.file !== undefined ? { file: patch.file } : {}),
	...(patch.subpath !== undefined ? { subpath: patch.subpath } : {}),
	...(patch.url !== undefined ? { url: patch.url } : {}),
	...(patch.label !== undefined ? { label: patch.label } : {}),
	...(asObjectOptional(patch.custom_data) ?? {}),
})

const updateEdgeRecord = (
	edge: CanvasEdgeRecord,
	patch: CanvasEdgePatch,
): CanvasEdgeRecord => ({
	...edge,
	...(patch.from_node !== undefined ? { fromNode: patch.from_node } : {}),
	...(patch.to_node !== undefined ? { toNode: patch.to_node } : {}),
	...(patch.from_side !== undefined ? { fromSide: patch.from_side } : {}),
	...(patch.to_side !== undefined ? { toSide: patch.to_side } : {}),
	...(patch.label !== undefined ? { label: patch.label } : {}),
	...(patch.color !== undefined ? { color: patch.color } : {}),
	...(asObjectOptional(patch.custom_data) ?? {}),
})

const requireNode = (document: CanvasDocumentRecord, nodeId: string): CanvasNodeRecord => {
	const node = document.nodes.find((item) => item.id === nodeId)
	if (!node) {
		throw new Error(`Canvas 节点不存在: ${nodeId}`)
	}
	return node
}

const requireEdge = (document: CanvasDocumentRecord, edgeId: string): CanvasEdgeRecord => {
	const edge = document.edges.find((item) => item.id === edgeId)
	if (!edge) {
		throw new Error(`Canvas 连线不存在: ${edgeId}`)
	}
	return edge
}

const assertNodeAbsent = (document: CanvasDocumentRecord, nodeId: string): void => {
	if (document.nodes.some((node) => node.id === nodeId)) {
		throw new Error(`Canvas 节点已存在: ${nodeId}`)
	}
}

const assertEdgeAbsent = (document: CanvasDocumentRecord, edgeId: string): void => {
	if (document.edges.some((edge) => edge.id === edgeId)) {
		throw new Error(`Canvas 连线已存在: ${edgeId}`)
	}
}

const assertEdgeEndpoints = (document: CanvasDocumentRecord, fromNode: string, toNode: string): void => {
	requireNode(document, fromNode)
	requireNode(document, toNode)
}

const applyAddNode = (
	document: CanvasDocumentRecord,
	operation: Extract<CanvasEditOperationLike, { action: 'add_node' }>,
	updatedNodeIds: string[],
	diffLines: string[],
): void => {
	assertNodeAbsent(document, operation.node.id)
	document.nodes.push(buildNodeRecord(operation.node))
	pushUnique(updatedNodeIds, operation.node.id)
	diffLines.push(`add_node ${operation.node.id}`)
}

const applyUpdateNode = (
	document: CanvasDocumentRecord,
	operation: Extract<CanvasEditOperationLike, { action: 'update_node' }>,
	updatedNodeIds: string[],
	diffLines: string[],
): void => {
	const current = requireNode(document, operation.node_id)
	const next = updateNodeRecord(current, operation.patch)
	document.nodes = document.nodes.map((node) => node.id === operation.node_id ? next : node)
	pushUnique(updatedNodeIds, operation.node_id)
	diffLines.push(`update_node ${operation.node_id}`)
}

const applyMoveNode = (
	document: CanvasDocumentRecord,
	operation: Extract<CanvasEditOperationLike, { action: 'move_node' }>,
	updatedNodeIds: string[],
	diffLines: string[],
): void => {
	applyUpdateNode(document, {
		action: 'update_node',
		node_id: operation.node_id,
		patch: { x: operation.x, y: operation.y },
	}, updatedNodeIds, diffLines)
	diffLines[diffLines.length - 1] = `move_node ${operation.node_id} -> (${operation.x}, ${operation.y})`
}

const applyRemoveNode = (
	document: CanvasDocumentRecord,
	operation: Extract<CanvasEditOperationLike, { action: 'remove_node' }>,
	removedNodeIds: string[],
	removedEdgeIds: string[],
	diffLines: string[],
): void => {
	requireNode(document, operation.node_id)
	const hasConnectedEdges = document.edges.some((edge) => (
		edge.fromNode === operation.node_id || edge.toNode === operation.node_id
	))
	if (hasConnectedEdges && operation.remove_connected_edges === false) {
		throw new Error(`Canvas 节点仍有关联连线，不能删除: ${operation.node_id}`)
	}
	if (hasConnectedEdges) {
		removeConnectedEdges(document, operation.node_id, removedEdgeIds)
	}
	document.nodes = document.nodes.filter((node) => node.id !== operation.node_id)
	pushUnique(removedNodeIds, operation.node_id)
	diffLines.push(`remove_node ${operation.node_id}`)
}

const applyAddEdge = (
	document: CanvasDocumentRecord,
	operation: Extract<CanvasEditOperationLike, { action: 'add_edge' }>,
	updatedEdgeIds: string[],
	diffLines: string[],
): void => {
	assertEdgeAbsent(document, operation.edge.id)
	assertEdgeEndpoints(document, operation.edge.from_node, operation.edge.to_node)
	document.edges.push(buildEdgeRecord(operation.edge))
	pushUnique(updatedEdgeIds, operation.edge.id)
	diffLines.push(`add_edge ${operation.edge.id}`)
}

const applyUpdateEdge = (
	document: CanvasDocumentRecord,
	operation: Extract<CanvasEditOperationLike, { action: 'update_edge' }>,
	updatedEdgeIds: string[],
	diffLines: string[],
): void => {
	const current = requireEdge(document, operation.edge_id)
	const next = updateEdgeRecord(current, operation.patch)
	assertEdgeEndpoints(document, next.fromNode, next.toNode)
	document.edges = document.edges.map((edge) => edge.id === operation.edge_id ? next : edge)
	pushUnique(updatedEdgeIds, operation.edge_id)
	diffLines.push(`update_edge ${operation.edge_id}`)
}

const applyRemoveEdge = (
	document: CanvasDocumentRecord,
	operation: Extract<CanvasEditOperationLike, { action: 'remove_edge' }>,
	removedEdgeIds: string[],
	diffLines: string[],
): void => {
	requireEdge(document, operation.edge_id)
	document.edges = document.edges.filter((edge) => edge.id !== operation.edge_id)
	pushUnique(removedEdgeIds, operation.edge_id)
	diffLines.push(`remove_edge ${operation.edge_id}`)
}

export const parseCanvasDocument = (content: string): CanvasDocumentRecord => {
	let parsed: unknown
	try {
		parsed = JSON.parse(content)
	} catch (error) {
		throw new Error(`Canvas 文件不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`)
	}
	const document = asRecord(parsed, 'Canvas 文件根结构必须是对象')
	const rawNodes = Array.isArray(document.nodes) ? document.nodes : []
	const rawEdges = Array.isArray(document.edges) ? document.edges : []
	return {
		...document,
		nodes: rawNodes.map((node) => parseCanvasNode(node)),
		edges: rawEdges.map((edge) => parseCanvasEdge(edge)),
	}
}

export const serializeCanvasDocument = (document: CanvasDocumentRecord): string => {
	return `${JSON.stringify(document, null, 2)}\n`
}

export const buildCanvasReadModel = (
	document: CanvasDocumentRecord,
	textPreviewLength: number,
): CanvasReadModel => ({
	nodes: document.nodes.map((node) => buildNodeView(node, textPreviewLength)),
	edges: document.edges.map((edge) => buildEdgeView(edge)),
	summary: {
		node_count: document.nodes.length,
		edge_count: document.edges.length,
		node_types: countNodeTypes(document.nodes),
		bounds: computeBounds(document.nodes),
	},
})

export const applyCanvasEditOperations = (
	document: CanvasDocumentRecord,
	operations: readonly CanvasEditOperationLike[],
): CanvasEditApplyResult => {
	const nextDocument = {
		...document,
		nodes: [...document.nodes],
		edges: [...document.edges],
	}
	const updatedNodeIds: string[] = []
	const updatedEdgeIds: string[] = []
	const removedNodeIds: string[] = []
	const removedEdgeIds: string[] = []
	const diffLines: string[] = []

	for (const operation of operations) {
		switch (operation.action) {
			case 'add_node':
				applyAddNode(nextDocument, operation, updatedNodeIds, diffLines)
				break
			case 'update_node':
				applyUpdateNode(nextDocument, operation, updatedNodeIds, diffLines)
				break
			case 'move_node':
				applyMoveNode(nextDocument, operation, updatedNodeIds, diffLines)
				break
			case 'remove_node':
				applyRemoveNode(nextDocument, operation, removedNodeIds, removedEdgeIds, diffLines)
				break
			case 'add_edge':
				applyAddEdge(nextDocument, operation, updatedEdgeIds, diffLines)
				break
			case 'update_edge':
				applyUpdateEdge(nextDocument, operation, updatedEdgeIds, diffLines)
				break
			case 'remove_edge':
				applyRemoveEdge(nextDocument, operation, removedEdgeIds, diffLines)
				break
		}
	}

	return {
		document: nextDocument,
		updatedNodeIds,
		updatedEdgeIds,
		removedNodeIds,
		removedEdgeIds,
		diffLines,
	}
}
