/**
 * @module settings/ai-runtime/core
 * @description legacy 兼容 shim，转发 settings 域拥有的 AI runtime 类型与配置逻辑。
 *
 * @dependencies src/domains/settings/types-ai-runtime,
 *   src/domains/settings/config-ai-runtime
 * @side-effects 无
 * @invariants 仅 re-export，不保留业务逻辑。
 *
 * @deprecated 真实实现已迁入 settings 域；保留此文件仅为兼容旧导入路径。
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

export type {
	AiRuntimeSettings,
	EditorStatus,
	ToolExecutionSettings,
};

export {
	cloneAiRuntimeSettings,
	DEFAULT_AI_RUNTIME_SETTINGS,
	DEFAULT_TOOL_EXECUTION_SETTINGS,
	resolveToolExecutionSettings,
	syncToolExecutionSettings,
};
