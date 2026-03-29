import type {
	QuickAction,
	QuickActionType,
	QuickActionYamlParser,
	QuickActionYamlStringifier,
	RawQuickAction,
} from './types';
import { localInstance } from 'src/i18n/locals';
import { DebugLogger } from 'src/utils/DebugLogger';

export const FRONTMATTER_DELIMITER = '---';

export type { QuickActionYamlParser, QuickActionYamlStringifier, RawQuickAction };

export const isNonEmptyString = (value: unknown): value is string => {
	return typeof value === 'string' && value.trim().length > 0;
};

export const toStringArray = (value: unknown): string[] => {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((item): item is string => typeof item === 'string');
};

export function resolveQuickActionType(raw: RawQuickAction): QuickActionType {
	if (raw.actionType === 'normal' || raw.actionType === 'group') {
		return raw.actionType;
	}
	if (raw.skillType === 'normal' || raw.skillType === 'group') {
		return raw.skillType;
	}
	if ((raw.isActionGroup ?? raw.isSkillGroup) === true) {
		return 'group';
	}
	return 'normal';
}

export function normalizeQuickAction(
	raw: RawQuickAction,
	fallback: { id: string; order: number; prompt?: string },
): QuickAction {
	const now = Date.now();
	const actionType = resolveQuickActionType(raw);
	const isActionGroup = raw.isActionGroup ?? raw.isSkillGroup ?? actionType === 'group';
	const rawWithoutLegacyFields = { ...raw };
	delete rawWithoutLegacyFields.skillType;
	delete rawWithoutLegacyFields.isSkillGroup;
	const promptSource = raw.promptSource === 'template' ? 'template' : 'custom';
	const defaultPrompt = isNonEmptyString(fallback.prompt) ? fallback.prompt : '';
	const rawPrompt = typeof raw.prompt === 'string' ? raw.prompt : defaultPrompt;
	const normalizedPrompt = promptSource === 'template' ? '' : rawPrompt;
	const rawName = typeof raw.name === 'string' ? raw.name.trim() : '';
	const normalizedName = rawName || localInstance.quick_action_data_unnamed;

	return {
		...rawWithoutLegacyFields,
		id: isNonEmptyString(raw.id) ? raw.id : fallback.id,
		name: normalizedName,
		prompt: normalizedPrompt,
		actionType,
		isActionGroup,
		children: toStringArray(raw.children),
		promptSource,
		showInToolbar: raw.showInToolbar ?? true,
		useDefaultSystemPrompt: raw.useDefaultSystemPrompt ?? true,
		customPromptRole: raw.customPromptRole === 'user' ? 'user' : 'system',
		templateFile: typeof raw.templateFile === 'string' ? raw.templateFile : undefined,
		modelTag: typeof raw.modelTag === 'string' ? raw.modelTag : undefined,
		order: typeof raw.order === 'number' ? raw.order : fallback.order,
		createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
		updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
	} as QuickAction;
}

export function normalizeQuickActions(
	rawList: unknown[],
	promptResolver?: (item: RawQuickAction, index: number) => string,
): QuickAction[] {
	const now = Date.now();
	return rawList
		.filter((item): item is RawQuickAction => !!item && typeof item === 'object')
		.map((item, index) =>
			normalizeQuickAction(item, {
				id: isNonEmptyString(item.id) ? item.id : `quick_action_${now}_${index}`,
				order: index,
				prompt: promptResolver?.(item, index) ?? '',
			}),
		);
}

export function parseMarkdownRecord(
	content: string,
	parseYaml: QuickActionYamlParser,
): { frontmatter: RawQuickAction; body: string } {
	if (!content.startsWith(FRONTMATTER_DELIMITER)) {
		return { frontmatter: {}, body: content };
	}
	const delimiterRegex = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n)?/;
	const matched = content.match(delimiterRegex);
	if (!matched) {
		return { frontmatter: {}, body: content };
	}

	try {
		const parsed = parseYaml(matched[1]);
		const frontmatter = (parsed && typeof parsed === 'object' ? parsed : {}) as RawQuickAction;
		const body = content.slice(matched[0].length);
		return { frontmatter, body };
	} catch (error) {
		DebugLogger.warn('[QuickActionDataService] 解析 frontmatter 失败，已使用默认值', error);
		return { frontmatter: {}, body: '' };
	}
}

export function buildMarkdownRecord(
	frontmatter: RawQuickAction,
	body: string,
	stringifyYaml: QuickActionYamlStringifier,
): string {
	const yaml = stringifyYaml(frontmatter).trimEnd();
	return `${FRONTMATTER_DELIMITER}\n${yaml}\n${FRONTMATTER_DELIMITER}\n${body}`;
}
