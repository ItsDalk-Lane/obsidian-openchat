import type { BuiltinTool } from '../runtime/types'
import type { FetchToolsOptions } from './fetch/schema'
import { createFetchWebpageTool } from './fetch-webpage/tool'
import { createFetchWebpagesBatchTool } from './fetch-webpages-batch/tool'

export {
	FETCH_WEBPAGE_TOOL_NAME,
} from './fetch-webpage/tool'
export {
	FETCH_WEBPAGES_BATCH_TOOL_NAME,
} from './fetch-webpages-batch/tool'
export type { FetchToolsOptions }

export function createFetchTools(
	options: FetchToolsOptions = {},
): BuiltinTool[] {
	return [
		createFetchWebpageTool(options),
		createFetchWebpagesBatchTool(options),
	]
}
