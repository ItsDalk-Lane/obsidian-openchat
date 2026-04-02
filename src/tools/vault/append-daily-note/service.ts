import type { App } from 'obsidian';
import type { BuiltinValidationResult } from '../../runtime/types';
import {
	appendToDailyNoteContent,
	ensureDailyNoteParentFolder,
	normalizeSectionHeading,
	parseDailyNoteDate,
	resolveDailyNoteTarget,
} from '../_shared/daily-note';
import type {
	AppendDailyNoteArgs,
	AppendDailyNoteResult,
} from './schema';

const trimAppendedContent = (content: string): string => {
	const normalized = String(content ?? '').replace(/\r\n/gu, '\n').trim();
	if (!normalized) {
		throw new Error('content 不能为空');
	}
	return normalized;
};

const normalizeAppendDailyNoteArgs = (
	args: AppendDailyNoteArgs,
): {
	date?: string;
	content: string;
	sectionHeading?: string;
} => {
	if (args.date) {
		parseDailyNoteDate(args.date);
	}
	const sectionHeading = normalizeSectionHeading(args.section_heading);
	return {
		...(args.date ? { date: args.date } : {}),
		content: trimAppendedContent(args.content),
		...(sectionHeading ? { sectionHeading } : {}),
	};
};

export const validateAppendDailyNoteInput = (
	args: AppendDailyNoteArgs,
): BuiltinValidationResult => {
	try {
		normalizeAppendDailyNoteArgs(args);
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
			notes: [
				'append_daily_note 由工具内部解析 daily note 路径，不需要模型自行猜路径。',
			],
		};
	}
};

export const summarizeAppendDailyNote = (
	args: Partial<AppendDailyNoteArgs>,
): string | null => {
	const date = args.date?.trim() || 'today';
	const heading = normalizeSectionHeading(args.section_heading ?? '');
	return heading ? `${date} @ ${heading}` : date;
};

export const describeAppendDailyNoteActivity = (
	args: Partial<AppendDailyNoteArgs>,
): string | null => {
	const summary = summarizeAppendDailyNote(args);
	return summary ? `追加 daily note 内容到 ${summary}` : '追加 daily note 内容';
};

export const executeAppendDailyNote = async (
	app: App,
	args: AppendDailyNoteArgs,
): Promise<AppendDailyNoteResult> => {
	const normalized = normalizeAppendDailyNoteArgs(args);
	const target = await resolveDailyNoteTarget(app, normalized.date);
	const existing = app.vault.getAbstractFileByPath(target.filePath);
	const currentContent = existing
		? await app.vault.cachedRead(existing as never)
		: '';
	const nextContent = appendToDailyNoteContent(
		currentContent,
		normalized.content,
		normalized.sectionHeading,
	);

	if (!existing) {
		await ensureDailyNoteParentFolder(app, target.filePath);
		await app.vault.create(target.filePath, nextContent);
	} else {
		await app.vault.modify(existing as never, nextContent);
	}

	return {
		file_path: target.filePath,
		created: !existing,
		updated: true,
		inserted_under_heading: normalized.sectionHeading ?? null,
	};
};
