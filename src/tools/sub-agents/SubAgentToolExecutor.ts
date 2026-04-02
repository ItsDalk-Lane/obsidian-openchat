import { v4 as uuidv4 } from 'uuid';
import type {
	ChatMessage,
	ChatSession,
} from 'src/domains/chat/types';
import type {
	ToolCallRequest,
	ToolCallResult,
	ToolDefinition,
	ToolExecutionOptions,
	ToolExecutionRecord,
	ToolExecutor,
} from 'src/types/tool';
import { DebugLogger } from 'src/utils/DebugLogger';
import { SubAgentScannerService } from './SubAgentScannerService';
import type {
	SubAgentChatServiceAdapter,
	SubAgentExecutionState,
	SubAgentExecutionStatus,
	SubAgentStateCallback,
} from './types';
import {
	DELEGATE_SUB_AGENT_TOOL_NAME,
	DISCOVER_SUB_AGENTS_TOOL_NAME,
	DEFAULT_SUB_AGENT_MAX_TOKENS,
	MAX_SUB_AGENT_NAME_LENGTH,
	MAX_SUB_AGENT_QUERY_LENGTH,
	MAX_SUB_AGENT_TASK_LENGTH,
	SUB_AGENT_TOOL_PREFIX,
	parseSubAgentNameFromToolName,
} from './types';

interface SubAgentToolInput {
	agent?: string;
	task: string;
	query?: string;
	invalidReason?: string;
}

export class SubAgentToolExecutor implements ToolExecutor {
	constructor(
		private readonly scanner: SubAgentScannerService,
		private readonly chatService: SubAgentChatServiceAdapter,
		private readonly parentSessionId: string,
		private readonly onStateChange: SubAgentStateCallback,
	) {}

	canHandle(call: ToolCallRequest): boolean {
		return call.name === DISCOVER_SUB_AGENTS_TOOL_NAME
			|| call.name === DELEGATE_SUB_AGENT_TOOL_NAME
			|| call.name.startsWith(SUB_AGENT_TOOL_PREFIX);
	}

	async execute(
		call: ToolCallRequest,
		_tools: ToolDefinition[],
		options?: ToolExecutionOptions,
	): Promise<ToolCallResult> {
		if (call.name === DISCOVER_SUB_AGENTS_TOOL_NAME) {
			return await this.executeDiscover(call);
		}

		const input = this.parseInput(call.arguments);
		if (input.invalidReason) {
			return this.createResult(call, input.invalidReason);
		}
		if (!input.task) {
			return this.createResult(call, 'Sub Agent 调用失败：缺少有效的 task 参数。');
		}

		const agentName = call.name === DELEGATE_SUB_AGENT_TOOL_NAME
			? (input.agent ?? '')
			: parseSubAgentNameFromToolName(call.name);
		if (!agentName) {
			return this.createResult(call, 'Sub Agent 调用失败：缺少有效的 agent 参数。');
		}
		const definition = await this.scanner.findByName(agentName);
		if (!definition) {
			return this.createResult(call, `Sub Agent 调用失败：未找到名为 ${agentName} 的 Sub Agent。`);
		}

		const internalMessages: ChatMessage[] = [
			this.createInternalMessage('system', definition.systemPrompt),
			this.createInternalMessage('user', input.task),
		];
		this.emitState(call.id, input.task, definition.metadata.name, 'running', internalMessages);

		try {
			const modelTag = definition.metadata.models?.trim() || this.chatService.getCurrentModelTag();
			if (!modelTag) {
				const content = 'Sub Agent 执行失败：当前没有可用的模型配置。';
				internalMessages.push(this.createInternalMessage('assistant', content, true));
				this.emitState(call.id, input.task, definition.metadata.name, 'failed', internalMessages);
				return this.createResult(call, content);
			}

			const toolRuntime = await this.chatService.resolveToolRuntime({
				includeSubAgents: false,
				explicitToolNames: definition.metadata.tools,
				explicitMcpServerIds: definition.metadata.mcps,
				parentSessionId: this.parentSessionId,
			});

			const childSession = this.createChildSession(modelTag, input.task);
			let assistantMessageRef: ChatMessage | null = null;

			const assistantMessage = await this.chatService.generateAssistantResponseForModel(childSession, modelTag, {
				abortSignal: options?.abortSignal,
				systemPromptOverride: definition.systemPrompt,
				createMessageInSession: false,
				manageGeneratingState: false,
				maxTokensOverride: definition.metadata.maxTokens ?? DEFAULT_SUB_AGENT_MAX_TOKENS,
				toolRuntimeOverride: toolRuntime,
				onChunk: (chunk) => {
					if (!assistantMessageRef) {
						assistantMessageRef = this.createInternalMessage('assistant', '');
						internalMessages.push(assistantMessageRef);
					}
					assistantMessageRef.content += chunk;
					this.emitState(call.id, input.task, definition.metadata.name, 'running', internalMessages);
				},
				onToolCallRecord: (record) => {
					this.upsertToolRecord(internalMessages, record);
					this.emitState(call.id, input.task, definition.metadata.name, 'running', internalMessages);
				},
			});

			const finalizedAssistantMessage = assistantMessageRef
				?? this.createInternalMessage('assistant', assistantMessage.content);
			if (!assistantMessageRef) {
				internalMessages.push(finalizedAssistantMessage);
			}
			finalizedAssistantMessage.content = assistantMessage.content;
			assistantMessageRef = finalizedAssistantMessage;

			const status: SubAgentExecutionStatus = options?.abortSignal?.aborted
				? 'cancelled'
				: 'completed';
			this.emitState(call.id, input.task, definition.metadata.name, status, internalMessages);

			if (status === 'cancelled') {
				return this.createResult(
					call,
					assistantMessage.content.trim() || 'Sub Agent 已取消，未返回最终结果。'
				);
			}
			return this.createResult(call, assistantMessage.content);
		} catch (error) {
			const aborted = options?.abortSignal?.aborted === true;
			const reason = error instanceof Error ? error.message : String(error);
			DebugLogger.error('[SubAgentToolExecutor] Sub Agent 执行失败', {
				callName: call.name,
				reason,
			});
			if (aborted) {
				this.emitState(call.id, input.task, definition.metadata.name, 'cancelled', internalMessages);
				return this.createResult(
					call,
					this.getLatestAssistantContent(internalMessages) || 'Sub Agent 已取消，未返回最终结果。'
				);
			}
			const content = `Sub Agent 执行失败：${reason}`;
			internalMessages.push(this.createInternalMessage('assistant', content, true));
			this.emitState(call.id, input.task, definition.metadata.name, 'failed', internalMessages);
			return this.createResult(call, content);
		}
	}

	private async executeDiscover(call: ToolCallRequest): Promise<ToolCallResult> {
		const input = this.parseInput(call.arguments);
		if (input.invalidReason) {
			return this.createResult(call, input.invalidReason);
		}
		const query = input.query?.toLowerCase();
		const scanResult = await this.scanner.scan();
		const agents = scanResult.agents
			.filter((agent) => {
				if (!query) {
					return true;
				}
				return agent.metadata.name.toLowerCase().includes(query)
					|| agent.metadata.description.toLowerCase().includes(query);
			})
			.map((agent) => ({
				name: agent.metadata.name,
				description: agent.metadata.description,
				tools: [...(agent.metadata.tools ?? [])],
				mcps: [...(agent.metadata.mcps ?? [])],
				model: agent.metadata.models ?? null,
				maxTokens: agent.metadata.maxTokens ?? null,
			}));
		return {
			toolCallId: call.id,
			name: call.name,
			content: JSON.stringify({
				agents,
				meta: {
					query: input.query?.trim() || null,
					returned: agents.length,
					total: scanResult.agents.length,
				},
			}),
			status: 'completed',
		};
	}

	private parseInput(rawArguments: string): SubAgentToolInput {
		try {
			const parsed = JSON.parse(rawArguments) as Partial<SubAgentToolInput>;
			const agent = typeof parsed.agent === 'string' ? parsed.agent.trim() : undefined;
			const task = typeof parsed.task === 'string' ? parsed.task.trim() : '';
			const query = typeof parsed.query === 'string' ? parsed.query.trim() : undefined;
			if (agent && agent.length > MAX_SUB_AGENT_NAME_LENGTH) {
				return {
					task: '',
					invalidReason: `Sub Agent 调用失败：agent 参数过长，最多 ${MAX_SUB_AGENT_NAME_LENGTH} 个字符。`,
				};
			}
			if (task.length > MAX_SUB_AGENT_TASK_LENGTH) {
				return {
					task: '',
					invalidReason: `Sub Agent 调用失败：task 参数过长，最多 ${MAX_SUB_AGENT_TASK_LENGTH} 个字符。`,
				};
			}
			if (query && query.length > MAX_SUB_AGENT_QUERY_LENGTH) {
				return {
					task: '',
					invalidReason: `Sub Agent 调用失败：query 参数过长，最多 ${MAX_SUB_AGENT_QUERY_LENGTH} 个字符。`,
				};
			}
			return {
				agent,
				task,
				query,
			};
		} catch {
			return { task: '' };
		}
	}

	private createChildSession(modelTag: string, task: string): ChatSession {
		const now = Date.now();
		return {
			id: `sub-agent-${uuidv4()}`,
			title: `Sub Agent: ${task.slice(0, 24) || 'task'}`,
			modelId: modelTag,
			messages: [this.createInternalMessage('user', task)],
			createdAt: now,
			updatedAt: now,
			contextNotes: [],
			selectedImages: [],
			selectedFiles: [],
			selectedFolders: [],
			livePlan: null,
			contextCompaction: null,
			requestTokenState: null,
		};
	}

	private createInternalMessage(
		role: ChatMessage['role'],
		content: string,
		isError = false,
	): ChatMessage {
		return {
			id: uuidv4(),
			role,
			content,
			timestamp: Date.now(),
			images: [],
			isError,
			metadata: {},
			toolCalls: [],
		};
	}

	private upsertToolRecord(internalMessages: ChatMessage[], record: ToolExecutionRecord): void {
		const existing = internalMessages.find((message) => message.toolCallId === record.id);
		const nextContent = record.result ?? '';
		if (existing) {
			existing.content = nextContent;
			existing.isError = record.status === 'failed';
			return;
		}
		internalMessages.push({
			id: uuidv4(),
			role: 'tool',
			content: nextContent,
			timestamp: record.timestamp,
			images: [],
			isError: record.status === 'failed',
			metadata: {
				toolName: record.name,
				toolArguments: record.arguments,
			},
			toolCalls: [],
			toolCallId: record.id,
		});
	}

	private emitState(
		toolCallId: string,
		task: string,
		name: string,
		status: SubAgentExecutionStatus,
		internalMessages: ChatMessage[],
	): void {
		const state: SubAgentExecutionState = {
			name,
			status,
			internalMessages: internalMessages.map((message) => ({
				...message,
				metadata: { ...(message.metadata ?? {}) },
				toolCalls: [...(message.toolCalls ?? [])],
			})),
			folded: true,
			toolCallId,
			task,
		};
		this.onStateChange({
			toolCallId,
			task,
			state,
		});
	}

	private getLatestAssistantContent(messages: ChatMessage[]): string {
		const assistantMessages = messages.filter((message) => message.role === 'assistant');
		return assistantMessages[assistantMessages.length - 1]?.content?.trim() ?? '';
	}

	/**
	 * 移除内容中的 MCP 工具标记
	 * 这些标记不应该出现在子代理的最终结果中，以避免嵌套标记导致解析问题
	 */
	private stripMcpToolMarkers(content: string): string {
		if (!content) return content;
		// 移除 MCP 工具标记：{{FF_MCP_TOOL_START}}:toolName:content{{FF_MCP_TOOL_END}}:
		// 使用非贪婪匹配，但需要处理可能的嵌套
		let result = content;
		let previous = '';
		// 多次迭代处理嵌套标记
		while (previous !== result) {
			previous = result;
			result = result.replace(
				/\{\{FF_MCP_TOOL_START\}\}:([^:]+):([\s\S]*?)\{\{FF_MCP_TOOL_END\}\}:/g,
				(_match, _toolName, toolContent) => {
					// 返回工具内容的摘要（如果内容很长，截取前200字符）
					const trimmed = (toolContent ?? '').trim();
					if (trimmed.length > 200) {
						return `[工具调用结果: ${trimmed.slice(0, 200)}...]`;
					}
					return trimmed ? `[工具调用结果: ${trimmed}]` : '';
				}
			);
		}
		return result.trim();
	}

	private createResult(call: ToolCallRequest, content: string): ToolCallResult {
		// 移除 MCP 工具标记，避免嵌套标记导致解析问题
		const cleanedContent = this.stripMcpToolMarkers(content);
		return {
			toolCallId: call.id,
			name: call.name,
			content: cleanedContent,
		};
	}
}
