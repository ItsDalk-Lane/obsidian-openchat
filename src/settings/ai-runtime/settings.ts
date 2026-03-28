import { azureVendor } from 'src/LLMProviders/azure';
import { claudeVendor } from 'src/LLMProviders/claude';
import { deepSeekVendor } from 'src/LLMProviders/deepSeek';
import { doubaoVendor } from 'src/LLMProviders/doubao';
import { geminiVendor } from 'src/LLMProviders/gemini';
import { gptImageVendor } from 'src/LLMProviders/gptImage';
import { grokVendor } from 'src/LLMProviders/grok';
import { kimiVendor } from 'src/LLMProviders/kimi';
import { ollamaVendor } from 'src/LLMProviders/ollama';
import { openAIVendor } from 'src/LLMProviders/openAI';
import { openRouterVendor } from 'src/LLMProviders/openRouter';
import { poeVendor } from 'src/LLMProviders/poe';
import { qianFanVendor } from 'src/LLMProviders/qianFan';
import { qwenVendor } from 'src/LLMProviders/qwen';
import { siliconFlowVendor } from 'src/LLMProviders/siliconflow';
import type { Vendor } from 'src/types/provider';
import { zhipuVendor } from 'src/LLMProviders/zhipu';
import {
	DEFAULT_AI_RUNTIME_SETTINGS,
	DEFAULT_TOOL_EXECUTION_SETTINGS,
	cloneAiRuntimeSettings,
	resolveToolExecutionSettings,
	syncToolExecutionSettings,
} from './core';
export type {
	AiRuntimeSettings,
	EditorStatus,
	ToolExecutionSettings,
} from './core';

export const APP_FOLDER = 'OpenChat';

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

export {
	DEFAULT_AI_RUNTIME_SETTINGS,
	DEFAULT_TOOL_EXECUTION_SETTINGS,
	cloneAiRuntimeSettings,
	resolveToolExecutionSettings,
	syncToolExecutionSettings,
};
