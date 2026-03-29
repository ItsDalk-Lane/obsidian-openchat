import type { ToolDefinition, ToolExecutionRecord } from 'src/types/tool';
import { SKILL_TOOL_NAME } from 'src/tools/skill/skill-tools';
import {
	buildSkillsSystemPromptBlock,
} from 'src/domains/skills/service';
import {
	resolveToolExecutionSettings,
} from 'src/settings/ai-runtime/api';
import { DebugLogger } from 'src/utils/DebugLogger';
import { detectImageGenerationIntent } from './chat-image-intent';
import {
	findProviderByTagExact as findProviderByTagExactHelper,
	getDefaultProviderTag as getDefaultProviderTagHelper,
	getModelDisplayName as getModelDisplayNameHelper,
	getOllamaCapabilities as getOllamaCapabilitiesHelper,
	getOllamaCapabilitiesForModel as getOllamaCapabilitiesForModelHelper,
	isCurrentModelSupportImageGeneration as isCurrentModelSupportImageGenerationHelper,
	normalizeOllamaBaseUrl as normalizeOllamaBaseUrlHelper,
	providerSupportsImageGeneration as providerSupportsImageGenerationHelper,
	resolveProvider as resolveProviderHelper,
	resolveProviderByTag as resolveProviderByTagHelper,
	rethrowImageGenerationError as rethrowImageGenerationErrorHelper,
} from './chat-provider-helpers';
import type {
	ChatServiceInternals,
} from './chat-service-internals';

export const getMaxToolCallLoops = (internals: ChatServiceInternals): number | undefined => {
	const maxLoops = resolveToolExecutionSettings(
		internals.settingsAccessor.getAiRuntimeSettings(),
	).maxToolCalls;
	return typeof maxLoops === 'number' && maxLoops > 0 ? maxLoops : undefined;
};

export const getDefaultProviderTag = (internals: ChatServiceInternals): string | null => {
	return getDefaultProviderTagHelper(
		internals.settingsAccessor.getAiRuntimeSettings().providers,
	);
};

export const resolveProvider = (internals: ChatServiceInternals) => {
	return resolveProviderHelper(
		internals.settingsAccessor.getAiRuntimeSettings().providers,
		internals.stateStore.getMutableState().selectedModelId,
	);
};

export const resolveProviderByTag = (
	internals: ChatServiceInternals,
	tag?: string,
) => {
	return resolveProviderByTagHelper(
		internals.settingsAccessor.getAiRuntimeSettings().providers,
		tag,
	);
};

export const findProviderByTagExact = (
	internals: ChatServiceInternals,
	tag?: string,
) => {
	return findProviderByTagExactHelper(
		internals.settingsAccessor.getAiRuntimeSettings().providers,
		tag,
	);
};

export const getModelDisplayName = (
	internals: ChatServiceInternals,
	provider: import('src/types/provider').ProviderSettings,
): string => {
	return getModelDisplayNameHelper(provider);
};

export const isCurrentModelSupportImageGeneration = (
	internals: ChatServiceInternals,
): boolean => {
	return isCurrentModelSupportImageGenerationHelper({
		providers: internals.settingsAccessor.getAiRuntimeSettings().providers,
		selectedModelId: internals.stateStore.getMutableState().selectedModelId,
	});
};

export const normalizeOllamaBaseUrl = (
	_baseInternals: ChatServiceInternals,
	baseURL?: string,
) => normalizeOllamaBaseUrlHelper(baseURL);

export const providerSupportsImageGeneration = (
	_providerInternals: ChatServiceInternals,
	provider: import('src/types/provider').ProviderSettings,
): boolean => providerSupportsImageGenerationHelper(provider);

export const rethrowImageGenerationError = (error: unknown): never => {
	return rethrowImageGenerationErrorHelper(error);
};

export const detectChatImageGenerationIntent = (content: string): boolean => {
	return detectImageGenerationIntent(content);
};

export const getOllamaCapabilities = async (
	internals: ChatServiceInternals,
	baseURL: string,
	model: string,
) => {
	return await getOllamaCapabilitiesHelper({
		cache: internals.ollamaCapabilityCache,
		baseURL,
		model,
		requestHttp: async (options) => await internals.obsidianApi.requestHttp(options),
	});
};

export const getOllamaCapabilitiesForModel = async (
	internals: ChatServiceInternals,
	modelTag: string,
) => {
	return await getOllamaCapabilitiesForModelHelper({
		cache: internals.ollamaCapabilityCache,
		providers: internals.settingsAccessor.getAiRuntimeSettings().providers,
		modelTag,
		enableReasoningToggle: internals.stateStore.getMutableState().enableReasoningToggle,
		requestHttp: async (options) => await internals.obsidianApi.requestHttp(options),
	});
};

export const showMcpNoticeOnce = (
	internals: ChatServiceInternals,
	message: string,
): void => {
	const now = Date.now();
	if (now - internals.lastMcpNoticeAt < 10000) {
		return;
	}
	internals.lastMcpNoticeAt = now;
	internals.obsidianApi.notify(message, 5000);
};

export const findInstalledSkillDefinition = (
	internals: ChatServiceInternals,
	skillName: string,
) => {
	const trimmedName = skillName.trim();
	if (!trimmedName) {
		return undefined;
	}
	const snapshotMatch = internals.service
		.getInstalledSkillsSnapshot()
		?.skills.find((skill) => skill.metadata.name === trimmedName);
	if (snapshotMatch) {
		return snapshotMatch;
	}
	return internals.runtimeDeps.getSkillScannerService()?.findByName(trimmedName);
};

export const normalizeToolExecutionRecord = (
	internals: ChatServiceInternals,
	record: ToolExecutionRecord,
): ToolExecutionRecord => {
	const normalizedArguments = { ...(record.arguments ?? {}) };
	if (record.name === SKILL_TOOL_NAME) {
		const skillName = typeof normalizedArguments.skill === 'string'
			? normalizedArguments.skill.trim()
			: '';
		if (skillName && typeof normalizedArguments.command !== 'string') {
			normalizedArguments.command = skillName;
		}
		if (skillName && typeof normalizedArguments.path !== 'string') {
			const definition = findInstalledSkillDefinition(internals, skillName);
			if (definition?.skillFilePath) {
				normalizedArguments.path = definition.skillFilePath;
			}
		}
	}
	return { ...record, arguments: normalizedArguments };
};

export const resolveSkillsSystemPromptBlock = async (
	internals: ChatServiceInternals,
	requestTools: ToolDefinition[],
): Promise<string | undefined> => {
	const includesSkillTool = requestTools.some((tool) => tool.name === SKILL_TOOL_NAME);
	if (!includesSkillTool) {
		return undefined;
	}
	const cachedSkills = internals.service.getInstalledSkillsSnapshot();
	if (cachedSkills) {
		return buildSkillsSystemPromptBlock(cachedSkills.skills);
	}
	try {
		const loadedSkills = await internals.service.loadInstalledSkills();
		return buildSkillsSystemPromptBlock(loadedSkills.skills);
	} catch (error) {
		DebugLogger.warn('[ChatService] 构建 skills system prompt 失败，回退为空列表', error);
		return buildSkillsSystemPromptBlock([]);
	}
};
