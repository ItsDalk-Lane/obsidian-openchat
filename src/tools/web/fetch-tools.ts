import type { BuiltinTool } from '../runtime/types'
import type { FetchToolsOptions } from './fetch/schema'
import { createFetchWebpageTool } from './fetch-webpage/tool'
import { createFetchWebpagesBatchTool } from './fetch-webpages-batch/tool'

export function createFetchTools(
	options: FetchToolsOptions = {},
): BuiltinTool[] {
	return [
		createFetchWebpageTool(options),
		createFetchWebpagesBatchTool(options),
	]
}
