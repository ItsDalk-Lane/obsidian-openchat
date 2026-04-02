import type { App } from 'obsidian';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { APPEND_DAILY_NOTE_DESCRIPTION } from './description';
import {
	describeAppendDailyNoteActivity,
	executeAppendDailyNote,
	summarizeAppendDailyNote,
	validateAppendDailyNoteInput,
} from './service';
import {
	appendDailyNoteAnnotations,
	appendDailyNoteResultSchema,
	appendDailyNoteSchema,
	type AppendDailyNoteArgs,
	type AppendDailyNoteResult,
} from './schema';

export const APPEND_DAILY_NOTE_TOOL_NAME = 'append_daily_note';

export const createAppendDailyNoteTool = (app: App) => buildBuiltinTool<
	AppendDailyNoteArgs,
	AppendDailyNoteResult
>({
	name: APPEND_DAILY_NOTE_TOOL_NAME,
	title: '追加 Daily Note',
	description: APPEND_DAILY_NOTE_DESCRIPTION,
	inputSchema: appendDailyNoteSchema,
	outputSchema: appendDailyNoteResultSchema,
	annotations: appendDailyNoteAnnotations,
	surface: {
		family: 'builtin.note.daily',
		visibility: 'default',
		argumentComplexity: 'low',
		riskLevel: 'mutating',
		oneLinePurpose: '向今日或指定日期的 daily note 追加内容。',
		whenNotToUse: [
			'明确普通文件路径时改用 write_file 或 edit_file',
			'只想查找 daily note 路径时不要先写入内容',
		],
		capabilityTags: [
			'daily note',
			'journal',
			'log',
			'note taking',
			'日记',
			'日报',
		],
		requiredArgsSummary: ['content'],
	},
	isReadOnly: () => false,
	isConcurrencySafe: () => false,
	validateInput: (args) => validateAppendDailyNoteInput(args),
	getToolUseSummary: summarizeAppendDailyNote,
	getActivityDescription: describeAppendDailyNoteActivity,
	execute: async (args) => await executeAppendDailyNote(app, args),
});
