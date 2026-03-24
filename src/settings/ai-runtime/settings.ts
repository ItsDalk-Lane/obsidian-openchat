import { IANAZone } from 'luxon';
import { azureVendor } from 'src/LLMProviders/azure';
import { claudeVendor } from 'src/LLMProviders/claude';
import { deepSeekVendor } from 'src/LLMProviders/deepSeek';
import { doubaoVendor } from 'src/LLMProviders/doubao';
import { geminiVendor } from 'src/LLMProviders/gemini';
import { gptImageVendor } from 'src/LLMProviders/gptImage';
import { grokVendor } from 'src/LLMProviders/grok';
import { kimiVendor } from 'src/LLMProviders/kimi';
import type { ModelCapabilityCache } from 'src/LLMProviders/modelCapability';
import { ollamaVendor } from 'src/LLMProviders/ollama';
import { openAIVendor } from 'src/LLMProviders/openAI';
import { openRouterVendor } from 'src/LLMProviders/openRouter';
import { poeVendor } from 'src/LLMProviders/poe';
import { qianFanVendor } from 'src/LLMProviders/qianFan';
import { qwenVendor } from 'src/LLMProviders/qwen';
import { siliconFlowVendor } from 'src/LLMProviders/siliconflow';
import type { McpSettings } from 'src/types/mcp';
import {
	DEFAULT_BUILTIN_TIME_TIMEZONE,
	DEFAULT_MCP_SETTINGS,
} from 'src/types/mcp';
import type { ProviderSettings, Vendor } from 'src/types/provider';
import type { SystemPromptsDataFile } from 'src/types/system-prompt';
import { zhipuVendor } from 'src/LLMProviders/zhipu';

export const APP_FOLDER = 'OpenChat';

export interface ToolExecutionSettings {
	maxToolCalls: number;
	timeoutMs: number;
}

export const DEFAULT_TOOL_EXECUTION_SETTINGS: ToolExecutionSettings = {
	maxToolCalls: 10,
	timeoutMs: 30000,
};

export interface EditorStatus {
	isTextInserting: boolean;
}

export interface AiRuntimeSettings {
	editorStatus: EditorStatus;
	providers: ProviderSettings[];
	vendorApiKeys?: Record<string, string>;
	vendorApiKeysByDevice?: Record<string, Record<string, string>>;
	enableGlobalSystemPrompts: boolean;
	enableDefaultSystemMsg?: boolean;
	defaultSystemMsg?: string;
	systemPromptsData?: SystemPromptsDataFile;
	enableStreamLog: boolean;
	debugMode: boolean;
	debugLevel: 'debug' | 'info' | 'warn' | 'error';
	enableLlmConsoleLog: boolean;
	llmResponsePreviewChars: number;
	enableTabCompletion: boolean;
	tabCompletionTriggerKey: string;
	tabCompletionContextLengthBefore: number;
	tabCompletionContextLengthAfter: number;
	tabCompletionTimeout: number;
	tabCompletionProviderTag: string;
	tabCompletionPromptTemplate: string;
	mcp?: McpSettings;
	toolExecution?: ToolExecutionSettings;
	modelCapabilityCache?: ModelCapabilityCache;
}

export const DEFAULT_AI_RUNTIME_SETTINGS: AiRuntimeSettings = {
	editorStatus: { isTextInserting: false },
	providers: [],
	vendorApiKeys: {},
	vendorApiKeysByDevice: {},
	enableGlobalSystemPrompts: false,
	enableStreamLog: false,
	debugMode: false,
	debugLevel: 'error',
	enableLlmConsoleLog: false,
	llmResponsePreviewChars: 100,
	enableTabCompletion: false,
	tabCompletionTriggerKey: 'Alt',
	tabCompletionContextLengthBefore: 1000,
	tabCompletionContextLengthAfter: 500,
	tabCompletionTimeout: 5000,
	tabCompletionProviderTag: '',
	tabCompletionPromptTemplate: '{{rules}}\n\n{{context}}',
	mcp: DEFAULT_MCP_SETTINGS,
	toolExecution: DEFAULT_TOOL_EXECUTION_SETTINGS,
	modelCapabilityCache: {},
};

export const availableVendors: Vendor[] = [
	openAIVendor,
	azureVendor,
	claudeVendor,
	deepSeekVendor,
	doubaoVendor,
	geminiVendor,
	gptImageVendor,
	grokVendor,
	kimiVendor,
	ollamaVendor,
	openRouterVendor,
	poeVendor,
	qianFanVendor,
	qwenVendor,
	siliconFlowVendor,
	zhipuVendor,
];

const cloneDeep = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const normalizeBuiltinTimeDefaultTimezone = (value: unknown): string => {
	const normalized = typeof value === 'string' ? value.trim() : '';
	if (!normalized || !IANAZone.isValidZone(normalized)) {
		return DEFAULT_BUILTIN_TIME_TIMEZONE;
	}
	return normalized;
};

const normalizeMcpSettings = (
	settings?: McpSettings | Record<string, unknown> | null,
): McpSettings => {
	const raw = (settings ?? {}) as Record<string, unknown>;
	const normalized: McpSettings = {
		...cloneDeep(DEFAULT_MCP_SETTINGS),
		...(raw as Partial<McpSettings>),
	};

	if (
		typeof normalized.builtinCoreToolsEnabled !== 'boolean'
		&& typeof raw.builtinVaultEnabled === 'boolean'
	) {
		normalized.builtinCoreToolsEnabled = raw.builtinVaultEnabled;
	}

	normalized.builtinTimeDefaultTimezone = normalizeBuiltinTimeDefaultTimezone(
		raw.builtinTimeDefaultTimezone,
	);

	for (const removedField of [
		'builtinVaultEnabled',
		'builtinObsidianSearchEnabled',
		'builtinMemoryEnabled',
		'builtinSequentialThinkingEnabled',
		'builtinMemoryFilePath',
		'builtinSequentialThinkingDisableThoughtLogging',
		'builtinTimeEnabled',
	] as const) {
		delete (normalized as Record<string, unknown>)[removedField];
	}

	return normalized;
};

const resolvePositiveInteger = (
	...candidates: Array<number | undefined | null>
): number | undefined => {
	for (const candidate of candidates) {
		if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
			return Math.floor(candidate);
		}
	}
	return undefined;
};

export const resolveToolExecutionSettings = (
	settings?: Partial<AiRuntimeSettings> | null,
): ToolExecutionSettings => ({
	maxToolCalls:
		resolvePositiveInteger(
			settings?.toolExecution?.maxToolCalls,
			settings?.mcp?.maxToolCallLoops,
			DEFAULT_TOOL_EXECUTION_SETTINGS.maxToolCalls,
		) ?? DEFAULT_TOOL_EXECUTION_SETTINGS.maxToolCalls,
	timeoutMs:
		resolvePositiveInteger(
			settings?.toolExecution?.timeoutMs,
			DEFAULT_TOOL_EXECUTION_SETTINGS.timeoutMs,
		) ?? DEFAULT_TOOL_EXECUTION_SETTINGS.timeoutMs,
});

export const syncToolExecutionSettings = (
	settings: AiRuntimeSettings,
	override?: Partial<ToolExecutionSettings>,
): ToolExecutionSettings => {
	const next = {
		...resolveToolExecutionSettings(settings),
		...(override ?? {}),
	};

	settings.toolExecution = cloneDeep(next);
	settings.mcp = normalizeMcpSettings(settings.mcp);
	settings.mcp.maxToolCallLoops = next.maxToolCalls;
	delete (settings as AiRuntimeSettings & Record<string, unknown>).toolAgent;
	delete (settings as AiRuntimeSettings & Record<string, unknown>).intentAgent;

	return next;
};

export const cloneAiRuntimeSettings = (
	override?: Partial<AiRuntimeSettings>,
): AiRuntimeSettings => {
	const clonedDefaults = cloneDeep(DEFAULT_AI_RUNTIME_SETTINGS);
	if (!override) {
		syncToolExecutionSettings(clonedDefaults);
		return clonedDefaults;
	}

	const clonedOverride = cloneDeep(override) as Record<string, unknown>;
	delete clonedOverride.promptTemplates;
	delete clonedOverride.toolAgent;
	delete clonedOverride.intentAgent;

	const merged = Object.assign(clonedDefaults, clonedOverride) as AiRuntimeSettings;
	merged.mcp = normalizeMcpSettings(
		merged.mcp as McpSettings | Record<string, unknown> | undefined,
	);
	syncToolExecutionSettings(merged);
	return merged;
};
