/**
 * @module editor/config
 * @description 提供 editor 域的默认配置与归一化逻辑。
 *
 * @dependencies src/domains/editor/types
 * @side-effects 无
 * @invariants 只处理 editor 域自身的配置值。
 */

import type { ContinuousUsageConfig, ContextBuilderOptions, EditorTabCompletionSettings } from './types';

export const DEFAULT_EDITOR_CONTEXT_OPTIONS: ContextBuilderOptions = {
	maxCharsBefore: 1000,
	maxCharsAfter: 500,
};

export const DEFAULT_EDITOR_TAB_COMPLETION_SETTINGS: EditorTabCompletionSettings = {
	enabled: false,
	triggerKey: 'Alt',
	contextLengthBefore: DEFAULT_EDITOR_CONTEXT_OPTIONS.maxCharsBefore,
	contextLengthAfter: DEFAULT_EDITOR_CONTEXT_OPTIONS.maxCharsAfter,
	timeout: 5000,
	providerTag: '',
	promptTemplate:
		'You are a writing continuation assistant. Continue the text naturally based on the editor context provided by the user. Output only the continuation without any explanation. Match the original language, style, and format. Do not repeat existing content.',
};

export const DEFAULT_CONTINUOUS_USAGE_CONFIG: ContinuousUsageConfig = {
	timeWindowMs: 5000,
	minConsecutiveCount: 3,
	maxSentencesOnContinuous: 5,
	defaultMaxSentences: 1,
};

/**
 * @precondition partialSettings 可以是缺省对象
 * @postcondition 返回完整可用的 Tab Completion 配置
 * @throws 从不抛出
 * @example normalizeEditorTabCompletionSettings({ enabled: true })
 */
export function normalizeEditorTabCompletionSettings(
	partialSettings: Partial<EditorTabCompletionSettings>,
): EditorTabCompletionSettings {
	return {
		...DEFAULT_EDITOR_TAB_COMPLETION_SETTINGS,
		...partialSettings,
		triggerKey: partialSettings.triggerKey?.trim() || DEFAULT_EDITOR_TAB_COMPLETION_SETTINGS.triggerKey,
		providerTag: partialSettings.providerTag?.trim() ?? DEFAULT_EDITOR_TAB_COMPLETION_SETTINGS.providerTag,
		promptTemplate:
			partialSettings.promptTemplate?.trim() || DEFAULT_EDITOR_TAB_COMPLETION_SETTINGS.promptTemplate,
	};
}
