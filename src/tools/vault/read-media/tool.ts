import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { READ_MEDIA_DESCRIPTION } from './description';
import { executeReadMedia } from './service';
import {
	readMediaAnnotations,
	readMediaFileSchema,
} from './schema';

export const READ_MEDIA_TOOL_NAME = 'read_media';

export const createReadMediaTool = (
	app: App,
) => buildBuiltinTool<{ file_path: string }>({
	name: READ_MEDIA_TOOL_NAME,
	title: '读取媒体文件',
	description: READ_MEDIA_DESCRIPTION,
	inputSchema: readMediaFileSchema,
	annotations: readMediaAnnotations,
	surface: {
		family: 'builtin.vault.read',
		visibility: 'default',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '读取已知图片或音频文件。',
		capabilityTags: ['image', 'audio', 'media', '图片', '音频', '媒体'],
		requiredArgsSummary: ['file_path'],
	},
	runtimePolicy: {
		contextDefaults: [
			{ field: 'file_path', source: 'selected-text-file-path' },
			{ field: 'file_path', source: 'active-file-path' },
		],
	},
	isReadOnly: () => true,
	isConcurrencySafe: () => true,
	getToolUseSummary: (args) => args.file_path ?? null,
	getActivityDescription: (args) =>
		args.file_path ? `读取媒体 ${args.file_path}` : null,
	execute: async (args) => await executeReadMedia(app, args),
});
