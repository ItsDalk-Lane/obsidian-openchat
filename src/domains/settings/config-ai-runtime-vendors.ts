/**
 * @module settings/config-ai-runtime-vendors
 * @description 提供 settings 域拥有的 AI runtime vendor 注册表。
 *
 * @dependencies src/LLMProviders/*, src/types/provider
 * @side-effects 无
 * @invariants 仅集中定义稳定的 vendor 列表与应用目录常量，不承载设置归一化逻辑。
 */

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
import { zhipuVendor } from 'src/LLMProviders/zhipu';
import type { Vendor } from 'src/types/provider';

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
