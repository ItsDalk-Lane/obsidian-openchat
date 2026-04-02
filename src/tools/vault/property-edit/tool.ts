import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { PROPERTY_EDIT_DESCRIPTION } from './description';
import {
	checkPropertyEditPermissions,
	describePropertyEditActivity,
	executePropertyEdit,
	isDestructivePropertyEdit,
	summarizePropertyEdit,
	validatePropertyEditInput,
} from './service';
import {
	propertyEditAnnotations,
	propertyEditResultSchema,
	propertyEditSchema,
	type PropertyEditArgs,
	type PropertyEditResult,
} from './schema';

export const PROPERTY_EDIT_TOOL_NAME = 'property_edit';

export const createPropertyEditTool = (app: App) => buildBuiltinTool<
	PropertyEditArgs,
	PropertyEditResult
>({
	name: PROPERTY_EDIT_TOOL_NAME,
	title: '编辑 Properties',
	description: PROPERTY_EDIT_DESCRIPTION,
	inputSchema: propertyEditSchema,
	outputSchema: propertyEditResultSchema,
	annotations: propertyEditAnnotations,
	surface: {
		family: 'builtin.vault.property',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'mutating',
		oneLinePurpose: '结构化编辑 Markdown frontmatter / Properties。',
		whenToUse: [
			'需要稳定修改 frontmatter 属性',
			'希望避免脆弱的 YAML 文本替换',
		],
		whenNotToUse: [
			'正文编辑请改用 edit_file',
			'只想读取属性时不要先做写入',
		],
		capabilityTags: [
			'property',
			'properties',
			'frontmatter',
			'metadata',
			'属性',
			'元数据',
		],
		requiredArgsSummary: ['file_path', 'operations'],
	},
	runtimePolicy: {
		contextDefaults: [
			{ field: 'file_path', source: 'selected-text-file-path' },
			{ field: 'file_path', source: 'active-file-path' },
		],
	},
	isReadOnly: () => false,
	isDestructive: isDestructivePropertyEdit,
	isConcurrencySafe: () => false,
	validateInput: validatePropertyEditInput,
	checkPermissions: async (args) => await checkPropertyEditPermissions(app, args),
	getToolUseSummary: summarizePropertyEdit,
	getActivityDescription: describePropertyEditActivity,
	execute: async (args) => await executePropertyEdit(app, args),
});
