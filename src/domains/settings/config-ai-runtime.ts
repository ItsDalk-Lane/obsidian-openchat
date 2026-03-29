/**
 * @module settings/config-ai-runtime
 * @description 提供 settings 域拥有的 AI runtime 默认值与归一化逻辑。
 *
 * @dependencies luxon, src/types/mcp, src/domains/settings/types-ai-runtime
 * @side-effects 会同步清理 runtime 中的 legacy toolAgent / intentAgent 字段
 * @invariants 仅处理数据归一化，不访问宿主能力，不读写持久化。
 */

import { IANAZone } from 'luxon';
import {
	DEFAULT_BUILTIN_TIME_TIMEZONE,
	DEFAULT_MCP_SETTINGS,
} from 'src/types/mcp';
import type { McpSettings } from 'src/types/mcp';
import type {
	AiRuntimeSettings,
	ToolExecutionSettings,
} from './types-ai-runtime';

export const DEFAULT_TOOL_EXECUTION_SETTINGS: ToolExecutionSettings = {
	maxToolCalls: 10,
	timeoutMs: 30000,
};

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

function cloneValue<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeBuiltinTimeDefaultTimezone(value: unknown): string {
	const normalized = typeof value === 'string' ? value.trim() : '';
	if (!normalized || !IANAZone.isValidZone(normalized)) {
		return DEFAULT_BUILTIN_TIME_TIMEZONE;
	}
	return normalized;
}

function normalizeMcpSettings(
	settings?: McpSettings | Record<string, unknown> | null,
): McpSettings {
	const raw = (settings ?? {}) as Record<string, unknown>;
	const normalized: McpSettings = {
		...cloneValue(DEFAULT_MCP_SETTINGS),
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
}

function resolvePositiveInteger(
	...candidates: Array<number | undefined | null>
): number | undefined {
	for (const candidate of candidates) {
		if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
			return Math.floor(candidate);
		}
	}
	return undefined;
}

/**
 * @precondition settings 可为空或部分字段缺失
 * @postcondition 返回补齐默认值后的工具执行配置
 * @throws 从不抛出
 */
export function resolveToolExecutionSettings(
	settings?: Partial<AiRuntimeSettings> | null,
): ToolExecutionSettings {
	return {
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
	};
}

/**
 * @precondition settings 为可变的 AiRuntimeSettings 对象
 * @postcondition toolExecution 与 mcp.maxToolCallLoops 保持同步，legacy 字段被清理
 * @throws 从不抛出
 */
export function syncToolExecutionSettings(
	settings: AiRuntimeSettings,
	override?: Partial<ToolExecutionSettings>,
): ToolExecutionSettings {
	const next = {
		...resolveToolExecutionSettings(settings),
		...(override ?? {}),
	};

	settings.toolExecution = cloneValue(next);
	settings.mcp = normalizeMcpSettings(settings.mcp);
	settings.mcp.maxToolCallLoops = next.maxToolCalls;
	delete (settings as AiRuntimeSettings & Record<string, unknown>).toolAgent;
	delete (settings as AiRuntimeSettings & Record<string, unknown>).intentAgent;
	return next;
}

/**
 * @precondition override 可为空或只包含部分字段
 * @postcondition 返回深拷贝且已归一化的 AiRuntimeSettings
 * @throws 从不抛出
 */
export function cloneAiRuntimeSettings(
	override?: Partial<AiRuntimeSettings>,
): AiRuntimeSettings {
	const clonedDefaults = cloneValue(DEFAULT_AI_RUNTIME_SETTINGS);
	if (!override) {
		syncToolExecutionSettings(clonedDefaults);
		return clonedDefaults;
	}

	const clonedOverride = cloneValue(override) as Record<string, unknown>;
	delete clonedOverride.promptTemplates;
	delete clonedOverride.toolAgent;
	delete clonedOverride.intentAgent;

	const merged = Object.assign(clonedDefaults, clonedOverride) as AiRuntimeSettings;
	merged.mcp = normalizeMcpSettings(
		merged.mcp as McpSettings | Record<string, unknown> | undefined,
	);
	syncToolExecutionSettings(merged);
	return merged;
}
