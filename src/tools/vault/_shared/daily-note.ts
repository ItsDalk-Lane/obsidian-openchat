import { moment, normalizePath, type App } from 'obsidian';
import { normalizeAndValidatePath } from 'src/core/services/fileOperationHelpers';
import { ensureParentFolderExists, normalizeVaultPath } from './helpers';

const DAILY_NOTES_CONFIG_PATH = '.obsidian/daily-notes.json';
const DEFAULT_DAILY_NOTE_FORMAT = 'YYYY-MM-DD';
const DEFAULT_SECTION_HEADING_LEVEL = '##';
const HEADING_PATTERN = /^(#{1,6})\s+(.*?)\s*$/u;

interface DailyNotesConfig {
	folder?: string;
	format?: string;
}

export interface ResolvedDailyNoteTarget {
	filePath: string;
	dateKey: string;
}

const normalizeDailyNotesConfig = (
	value: unknown,
): DailyNotesConfig => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}
	const record = value as Record<string, unknown>;
	return {
		folder: typeof record.folder === 'string' ? record.folder.trim() : undefined,
		format: typeof record.format === 'string' ? record.format.trim() : undefined,
	};
};

export const parseDailyNoteDate = (
	date?: string,
): { momentValue: ReturnType<typeof moment>; dateKey: string } => {
	if (!date) {
		const now = moment();
		return {
			momentValue: now,
			dateKey: now.format('YYYY-MM-DD'),
		};
	}
	const parsed = moment(date, 'YYYY-MM-DD', true);
	if (!parsed.isValid()) {
		throw new Error('date 必须是 YYYY-MM-DD 格式');
	}
	return {
		momentValue: parsed,
		dateKey: parsed.format('YYYY-MM-DD'),
	};
};

export const readDailyNotesConfig = async (
	app: App,
): Promise<DailyNotesConfig> => {
	try {
		const raw = await app.vault.adapter.read(DAILY_NOTES_CONFIG_PATH);
		return normalizeDailyNotesConfig(JSON.parse(raw));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/exist|enoent|not found|不存在/i.test(message)) {
			return {};
		}
		throw new Error(`读取 daily notes 配置失败: ${message}`);
	}
};

export const resolveDailyNoteTarget = async (
	app: App,
	date?: string,
): Promise<ResolvedDailyNoteTarget> => {
	const { momentValue, dateKey } = parseDailyNoteDate(date);
	const config = await readDailyNotesConfig(app);
	const folder = normalizeVaultPath(config.folder ?? '');
	const format = config.format || DEFAULT_DAILY_NOTE_FORMAT;
	const formattedPath = momentValue.format(format).trim();
	if (!formattedPath) {
		throw new Error('daily notes 配置的 format 生成了空路径');
	}
	const fileName = formattedPath.endsWith('.md')
		? formattedPath
		: `${formattedPath}.md`;
	const filePath = normalizeVaultPath(
		folder ? `${folder}/${fileName}` : fileName,
	);
	normalizeAndValidatePath(filePath);
	return {
		filePath: normalizePath(filePath).replace(/^\/+/u, ''),
		dateKey,
	};
};

export const normalizeSectionHeading = (
	sectionHeading?: string,
): string | undefined => {
	if (!sectionHeading) {
		return undefined;
	}
	const normalized = String(sectionHeading)
		.replace(/^#+\s*/u, '')
		.replace(/\s+/gu, ' ')
		.trim();
	if (!normalized) {
		throw new Error('section_heading 不能为空');
	}
	return normalized;
};

const trimMarkdownBlock = (text: string): string => {
	return text.replace(/^\s*\n+/u, '').replace(/\n+\s*$/u, '').trimEnd();
};

const joinMarkdownBlocks = (base: string, block: string): string => {
	const normalizedBase = base.replace(/\r\n/gu, '\n').trimEnd();
	const normalizedBlock = trimMarkdownBlock(block);
	if (!normalizedBase) {
		return normalizedBlock;
	}
	if (!normalizedBlock) {
		return normalizedBase;
	}
	return `${normalizedBase}\n\n${normalizedBlock}`;
};

const buildSectionBlock = (
	sectionHeading: string,
	content: string,
): string => {
	return `${DEFAULT_SECTION_HEADING_LEVEL} ${sectionHeading}\n\n${trimMarkdownBlock(content)}`;
};

export const appendToDailyNoteContent = (
	originalContent: string,
	content: string,
	sectionHeading?: string,
): string => {
	const normalizedOriginal = originalContent.replace(/\r\n/gu, '\n');
	const normalizedContent = trimMarkdownBlock(content);
	if (!sectionHeading) {
		return joinMarkdownBlocks(normalizedOriginal, normalizedContent);
	}

	const lines = normalizedOriginal.split('\n');
	let matchedIndex = -1;
	let matchedLevel = 0;
	for (const [index, line] of lines.entries()) {
		const match = line.match(HEADING_PATTERN);
		if (!match) {
			continue;
		}
		if (match[2]?.trim() === sectionHeading) {
			matchedIndex = index;
			matchedLevel = match[1]?.length ?? 0;
			break;
		}
	}

	if (matchedIndex < 0) {
		return joinMarkdownBlocks(
			normalizedOriginal,
			buildSectionBlock(sectionHeading, normalizedContent),
		);
	}

	let sectionEnd = lines.length;
	for (let index = matchedIndex + 1; index < lines.length; index += 1) {
		const match = lines[index]?.match(HEADING_PATTERN);
		if (!match) {
			continue;
		}
		if ((match[1]?.length ?? 0) <= matchedLevel) {
			sectionEnd = index;
			break;
		}
	}

	const sectionPrefix = lines.slice(0, sectionEnd).join('\n');
	const sectionSuffix = lines.slice(sectionEnd).join('\n');
	const updatedPrefix = joinMarkdownBlocks(sectionPrefix, normalizedContent);
	return sectionSuffix
		? `${updatedPrefix}\n\n${sectionSuffix.trimStart()}`
		: updatedPrefix;
};

export const ensureDailyNoteParentFolder = async (
	app: App,
	filePath: string,
): Promise<void> => {
	await ensureParentFolderExists(app, filePath);
};
