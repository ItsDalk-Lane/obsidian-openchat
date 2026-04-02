import type { App } from 'obsidian'
import type { BuiltinTool } from '../runtime/types'
import {
	createDataviewQueryTool,
	DATAVIEW_QUERY_TOOL_NAME,
} from './dataview-query/tool'
import { hasDataviewQueryCapability } from './dataview-query/service'

export {
	DATAVIEW_QUERY_TOOL_NAME,
}

export const createIntegrationTools = (app: App): BuiltinTool[] => {
	if (!hasDataviewQueryCapability(app)) {
		return []
	}
	return [createDataviewQueryTool(app)]
}
