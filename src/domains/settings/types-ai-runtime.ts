/**
 * @module settings/types-ai-runtime
 * @description 定义 settings 域拥有的 AI runtime 类型。
 *
 * @dependencies src/LLMProviders/modelCapability, src/types/mcp,
 *   src/types/provider
 * @side-effects 无
 * @invariants 仅定义数据结构，不包含默认值、归一化或迁移逻辑。
 *
 * @migration 旧路径 src/settings/ai-runtime/* 现仅保留兼容 shim。
 *   此文件是 AiRuntimeSettings 的真实归属。
 */

import type { ModelCapabilityCache } from 'src/LLMProviders/modelCapability';
import type { McpSettings } from 'src/types/mcp';
import type { ProviderSettings } from 'src/types/provider';

export interface ToolExecutionSettings {
	maxToolCalls: number;
	timeoutMs: number;
}

export interface ToolSurfaceSettings {
	toolDiscoveryCatalogV2?: boolean;
	twoStageToolSelection?: boolean;
	scopedMcpResolve?: boolean;
	runtimeArgCompletionV2?: boolean;
	workflowToolsDefaultHidden?: boolean;
	workflowModeV1?: boolean;
	timeWrappersV1?: boolean;
	vaultWrappersV1?: boolean;
	fetchWrappersV1?: boolean;
	nativeDeferredAdapter?: boolean;
}

export interface EditorStatus {
	isTextInserting: boolean;
}

export interface AiRuntimeSettings {
	editorStatus: EditorStatus;
	providers: ProviderSettings[];
	vendorApiKeys?: Record<string, string>;
	vendorApiKeysByDevice?: Record<string, Record<string, string>>;
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
	toolSurface?: ToolSurfaceSettings;
	modelCapabilityCache?: ModelCapabilityCache;
	quickActionsSystemPrompt?: string;
}
