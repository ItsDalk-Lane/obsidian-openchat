import type { BuiltinTool } from '../../runtime/types';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { GET_FIRST_LINK_PATH_DESCRIPTION } from './description';
import {
	describeGetFirstLinkPathActivity,
	executeGetFirstLinkPath,
	summarizeGetFirstLinkPath,
	validateGetFirstLinkPathInput,
} from './service';
import {
	getFirstLinkPathAnnotations,
	getFirstLinkPathResultSchema,
	getFirstLinkPathSchema,
	type GetFirstLinkPathArgs,
	type GetFirstLinkPathResult,
} from './schema';

export const GET_FIRST_LINK_PATH_TOOL_NAME = 'get_first_link_path';

export const createGetFirstLinkPathTool = (): BuiltinTool<
	GetFirstLinkPathArgs,
	GetFirstLinkPathResult
> => buildBuiltinTool<GetFirstLinkPathArgs, GetFirstLinkPathResult>({
	name: GET_FIRST_LINK_PATH_TOOL_NAME,
	title: '解析内部链接路径',
	description: GET_FIRST_LINK_PATH_DESCRIPTION,
	inputSchema: getFirstLinkPathSchema,
	outputSchema: getFirstLinkPathResultSchema,
	annotations: getFirstLinkPathAnnotations,
	surface: {
		family: 'builtin.vault.discovery',
		visibility: 'default',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '把内部链接解析成真实文件路径。',
		whenNotToUse: [
			'直接读取内容时改用 read_file',
			'只知道关键词时改用 find_paths',
		],
		capabilityTags: ['link', 'path', 'wiki link', '内部链接', '路径'],
		requiredArgsSummary: ['internal_link'],
	},
	isReadOnly: () => true,
	validateInput: (args) => validateGetFirstLinkPathInput(args),
	getToolUseSummary: summarizeGetFirstLinkPath,
	getActivityDescription: describeGetFirstLinkPathActivity,
	execute: (args, context) => executeGetFirstLinkPath(args, context),
});
