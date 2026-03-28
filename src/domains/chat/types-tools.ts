/**
 * @module chat/types-tools
 * @description 定义 chat 域工具调用记录的纯数据结构。
 *
 * @dependencies 无
 * @side-effects 无
 * @invariants 工具调用结果保持可序列化。
 */

export interface ToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
	result?: string;
	status: 'pending' | 'completed' | 'failed';
	timestamp: number;
}