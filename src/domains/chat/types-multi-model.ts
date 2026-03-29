/**
 * @module chat/types-multi-model
 * @description 定义 chat 域多模型对比相关的纯数据结构。
 *
 * @dependencies 无
 * @side-effects 无
 * @invariants 仅包含多模型布局与响应数据，不承载运行时逻辑。
 */

export type MultiModelMode = 'single' | 'compare';

export type LayoutMode = 'horizontal' | 'tabs' | 'vertical';

export interface ParallelResponseEntry {
	modelTag: string;
	modelName: string;
	content: string;
	isComplete: boolean;
	isError: boolean;
	error?: string;
	errorMessage?: string;
	messageId?: string;
}

export interface ParallelResponseGroup {
	groupId: string;
	userMessageId: string;
	responses: ParallelResponseEntry[];
}