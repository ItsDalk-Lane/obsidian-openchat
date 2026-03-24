export const LEGACY_AI_RUNTIME_CONTAINER_KEY = 'tars' as const;
export const LEGACY_AI_RUNTIME_SETTINGS_KEY = 'settings' as const;
export const LEGACY_SYSTEM_PROMPT_FEATURE_ID = 'tars_chat' as const;
export const LEGACY_FALLBACK_FINGERPRINT_SEEDS = ['obsidian-tars-default-key'] as const;

export const readLegacyAiRuntimeSettings = (persisted: unknown): Record<string, unknown> | undefined => {
	const container = (persisted as Record<string, unknown> | null | undefined)?.[LEGACY_AI_RUNTIME_CONTAINER_KEY];
	if (!container || typeof container !== 'object') {
		return undefined;
	}
	const settings = (container as Record<string, unknown>)[LEGACY_AI_RUNTIME_SETTINGS_KEY];
	if (!settings || typeof settings !== 'object') {
		return undefined;
	}
	return settings as Record<string, unknown>;
};

export const removeLegacyAiRuntimeContainer = (persisted: Record<string, unknown>): void => {
	delete persisted[LEGACY_AI_RUNTIME_CONTAINER_KEY];
};

export const normalizeLegacySystemPromptFeatureId = (featureId: string): string =>
	featureId === LEGACY_SYSTEM_PROMPT_FEATURE_ID ? 'ai_chat' : featureId;
