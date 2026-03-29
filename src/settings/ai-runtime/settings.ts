/**
 * @module settings/ai-runtime/settings
 * @description legacy 兼容 shim，转发 settings 域拥有的 AI runtime vendor 注册表与配置逻辑。
 *
 * @dependencies src/domains/settings/config-ai-runtime,
 *   src/domains/settings/config-ai-runtime-vendors,
 *   src/domains/settings/types-ai-runtime
 * @side-effects 无
 * @invariants 仅 re-export，不保留业务逻辑。
 *
 * @deprecated 真实实现已迁入 settings 域；保留此文件仅为兼容旧导入路径。
 */

import {
	DEFAULT_AI_RUNTIME_SETTINGS,
	DEFAULT_TOOL_EXECUTION_SETTINGS,
	cloneAiRuntimeSettings,
	resolveToolExecutionSettings,
	syncToolExecutionSettings,
} from 'src/domains/settings/config-ai-runtime';
import {
	APP_FOLDER,
	availableVendors,
} from 'src/domains/settings/config-ai-runtime-vendors';
import type {
	AiRuntimeSettings,
	EditorStatus,
	ToolExecutionSettings,
} from 'src/domains/settings/types-ai-runtime';

export type {
	AiRuntimeSettings,
	EditorStatus,
	ToolExecutionSettings,
};

export {
	APP_FOLDER,
	availableVendors,
	DEFAULT_AI_RUNTIME_SETTINGS,
	DEFAULT_TOOL_EXECUTION_SETTINGS,
	cloneAiRuntimeSettings,
	resolveToolExecutionSettings,
	syncToolExecutionSettings,
};
