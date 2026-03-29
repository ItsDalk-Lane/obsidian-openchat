/**
 * @module settings/ai-runtime/api
 * @description legacy 兼容 shim，聚合导出 AI runtime 类型、默认值与 vendor 列表。
 *
 * @dependencies src/domains/settings/types-ai-runtime,
 *   src/domains/settings/config-ai-runtime,
 *   src/domains/settings/config-ai-runtime-vendors
 * @side-effects 无
 * @invariants 仅 re-export，不保留业务逻辑。
 */

import type {
	AiRuntimeSettings,
	EditorStatus,
	ToolExecutionSettings,
} from 'src/domains/settings/types-ai-runtime';
import {
	cloneAiRuntimeSettings,
	DEFAULT_AI_RUNTIME_SETTINGS,
	DEFAULT_TOOL_EXECUTION_SETTINGS,
	resolveToolExecutionSettings,
	syncToolExecutionSettings,
} from 'src/domains/settings/config-ai-runtime';
import {
	APP_FOLDER,
	availableVendors,
} from 'src/domains/settings/config-ai-runtime-vendors';

export type {
	AiRuntimeSettings,
	EditorStatus,
	ToolExecutionSettings,
};

export {
	APP_FOLDER,
	availableVendors,
	cloneAiRuntimeSettings,
	DEFAULT_AI_RUNTIME_SETTINGS,
	DEFAULT_TOOL_EXECUTION_SETTINGS,
	resolveToolExecutionSettings,
	syncToolExecutionSettings,
};
