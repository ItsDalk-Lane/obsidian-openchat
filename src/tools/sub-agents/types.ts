import type {
	ChatMessage,
	ChatSession,
	SubAgentExecutionState,
	SubAgentExecutionStatus,
} from 'src/types/chat';
import type {
	ToolDefinition,
	ToolExecutionRecord,
	ToolExecutor,
} from 'src/types/tool';

export const SUB_AGENT_TOOL_PREFIX = 'sub_agent_';
export const DEFAULT_SUB_AGENT_MAX_TOKENS = 4096;

export type { SubAgentExecutionState, SubAgentExecutionStatus };

export interface SubAgentMetadata {
	name: string;
	description: string;
	tools?: string[];
	mcps?: string[];
	models?: string;
	maxTokens?: number;
}

export interface SubAgentDefinition {
	metadata: SubAgentMetadata;
	agentFilePath: string;
	systemPrompt: string;
}

export interface SubAgentScanError {
	path: string;
	reason: string;
	severity?: 'warning' | 'error';
}

export interface SubAgentScanResult {
	agents: SubAgentDefinition[];
	errors: SubAgentScanError[];
}

export interface SubAgentStateUpdate {
	toolCallId: string;
	task: string;
	state: SubAgentExecutionState;
}

export type SubAgentStateCallback = (update: SubAgentStateUpdate) => void;

export interface ToolRuntimeResolutionOptions {
	includeSubAgents?: boolean;
	explicitToolNames?: string[];
	explicitMcpServerIds?: string[];
	parentSessionId?: string;
	subAgentStateCallback?: SubAgentStateCallback;
	session?: ChatSession;
}

export interface ResolvedToolRuntime {
	requestTools: ToolDefinition[];
	toolExecutor?: ToolExecutor;
	maxToolCallLoops?: number;
}

export interface SubAgentChatServiceAdapter {
	getCurrentModelTag(): string | null;
	resolveToolRuntime(options?: ToolRuntimeResolutionOptions): Promise<ResolvedToolRuntime>;
	generateAssistantResponseForModel(
		session: ChatSession,
		modelTag: string,
		options?: {
			abortSignal?: AbortSignal;
			onChunk?: (chunk: string, message: ChatMessage) => void;
			systemPromptOverride?: string;
			createMessageInSession?: boolean;
			manageGeneratingState?: boolean;
			maxTokensOverride?: number;
			toolRuntimeOverride?: ResolvedToolRuntime;
			onToolCallRecord?: (record: ToolExecutionRecord) => void;
		}
	): Promise<ChatMessage>;
}

export const requireNonEmptyString = (value: unknown, fieldName: string): string => {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`frontmatter.${fieldName} 为必填项`);
	}
	return value.trim();
};

export const normalizeStringArray = (value: unknown): string[] | undefined => {
	if (!Array.isArray(value)) {
		return undefined;
	}
	return value
		.filter((entry): entry is string => typeof entry === 'string')
		.map((entry) => entry.trim());
};

export const normalizeOptionalModel = (value: unknown): string | undefined => {
	if (typeof value !== 'string' || !value.trim()) {
		return undefined;
	}
	return value.trim();
};

export const normalizePositiveInteger = (value: unknown): number | undefined => {
	if (!Number.isInteger(value) || Number(value) <= 0) {
		return undefined;
	}
	return Number(value);
};

export const buildSubAgentToolName = (name: string): string => {
	return `${SUB_AGENT_TOOL_PREFIX}${name}`;
};

export const parseSubAgentNameFromToolName = (toolName: string): string => {
	return toolName.startsWith(SUB_AGENT_TOOL_PREFIX)
		? toolName.slice(SUB_AGENT_TOOL_PREFIX.length)
		: toolName;
};
