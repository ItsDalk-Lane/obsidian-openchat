export type CanvasNodeType = 'text' | 'file' | 'link' | 'group'
export type CanvasSide = 'top' | 'right' | 'bottom' | 'left'

export interface CanvasNodeRecord extends Record<string, unknown> {
	readonly id: string
	readonly type: string
	readonly x: number
	readonly y: number
	readonly width: number
	readonly height: number
	readonly color?: string
	readonly text?: string
	readonly file?: string
	readonly subpath?: string
	readonly url?: string
	readonly label?: string
}

export interface CanvasEdgeRecord extends Record<string, unknown> {
	readonly id: string
	readonly fromNode: string
	readonly toNode: string
	readonly fromSide?: string
	readonly toSide?: string
	readonly label?: string
	readonly color?: string
}

export interface CanvasDocumentRecord extends Record<string, unknown> {
	nodes: CanvasNodeRecord[]
	edges: CanvasEdgeRecord[]
}

export interface ReadCanvasNodeView {
	readonly id: string
	readonly type: string
	readonly x: number
	readonly y: number
	readonly width: number
	readonly height: number
	readonly color?: string
	readonly label: string
	readonly text_preview?: string
	readonly file?: string
	readonly subpath?: string
	readonly url?: string
}

export interface ReadCanvasEdgeView {
	readonly id: string
	readonly from_node: string
	readonly to_node: string
	readonly from_side?: string
	readonly to_side?: string
	readonly label?: string
	readonly color?: string
}

export interface CanvasSummary {
	readonly node_count: number
	readonly edge_count: number
	readonly node_types: Record<string, number>
	readonly bounds: {
		readonly left: number
		readonly top: number
		readonly right: number
		readonly bottom: number
	} | null
}

export interface CanvasReadModel {
	readonly nodes: ReadCanvasNodeView[]
	readonly edges: ReadCanvasEdgeView[]
	readonly summary: CanvasSummary
}

export interface CanvasNodeDraft extends Record<string, unknown> {
	readonly id: string
	readonly type: CanvasNodeType
	readonly x: number
	readonly y: number
	readonly width: number
	readonly height: number
	readonly color?: string
	readonly text?: string
	readonly file?: string
	readonly subpath?: string
	readonly url?: string
	readonly label?: string
	readonly custom_data?: Record<string, unknown>
}

export interface CanvasNodePatch extends Record<string, unknown> {
	readonly x?: number
	readonly y?: number
	readonly width?: number
	readonly height?: number
	readonly color?: string
	readonly text?: string
	readonly file?: string
	readonly subpath?: string
	readonly url?: string
	readonly label?: string
	readonly custom_data?: Record<string, unknown>
}

export interface CanvasEdgeDraft extends Record<string, unknown> {
	readonly id: string
	readonly from_node: string
	readonly to_node: string
	readonly from_side?: CanvasSide
	readonly to_side?: CanvasSide
	readonly label?: string
	readonly color?: string
	readonly custom_data?: Record<string, unknown>
}

export interface CanvasEdgePatch extends Record<string, unknown> {
	readonly from_node?: string
	readonly to_node?: string
	readonly from_side?: CanvasSide
	readonly to_side?: CanvasSide
	readonly label?: string
	readonly color?: string
	readonly custom_data?: Record<string, unknown>
}

export type CanvasEditOperationLike =
	| { readonly action: 'add_node'; readonly node: CanvasNodeDraft }
	| { readonly action: 'update_node'; readonly node_id: string; readonly patch: CanvasNodePatch }
	| { readonly action: 'move_node'; readonly node_id: string; readonly x: number; readonly y: number }
	| { readonly action: 'remove_node'; readonly node_id: string; readonly remove_connected_edges?: boolean }
	| { readonly action: 'add_edge'; readonly edge: CanvasEdgeDraft }
	| { readonly action: 'update_edge'; readonly edge_id: string; readonly patch: CanvasEdgePatch }
	| { readonly action: 'remove_edge'; readonly edge_id: string }

export interface CanvasEditApplyResult {
	readonly document: CanvasDocumentRecord
	readonly updatedNodeIds: string[]
	readonly updatedEdgeIds: string[]
	readonly removedNodeIds: string[]
	readonly removedEdgeIds: string[]
	readonly diffLines: string[]
}