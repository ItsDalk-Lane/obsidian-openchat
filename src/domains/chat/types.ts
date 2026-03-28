/**
 * @module chat/types
 * @description 定义 chat 域共享的稳定数据结构。
 *
 * @dependencies src/domains/chat/types-multi-model, src/domains/chat/types-tools
 * @side-effects 无
 * @invariants 仅承载纯数据结构，不承载默认值、归一化逻辑或宿主能力。
 */

import type { LayoutMode, MultiModelMode, ParallelResponseGroup } from './types-multi-model';
import type { ToolCall } from './types-tools';

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

export type FileRole = 'processing_target' | 'reference' | 'example' | 'context';

export interface FileIntentAnalysis {
	role: FileRole;
	reasoning: string;
	confidence: 'high' | 'medium' | 'low';
}

export interface SelectedFile {
	id: string;
	name: string;
	path: string;
	extension: string;
	type: 'file';
	isAutoAdded?: boolean;
}

export interface SelectedFolder {
	id: string;
	name: string;
	path: string;
	type: 'folder';
}

export type SelectedItem = SelectedFile | SelectedFolder;

export type SubAgentExecutionStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface SubAgentExecutionState {
	name: string;
	status: SubAgentExecutionStatus;
	internalMessages: ChatMessage[];
	folded: boolean;
	toolCallId?: string;
	task?: string;
}

export interface ChatMessageMetadata extends Record<string, unknown> {
	pinned?: boolean;
	selectedText?: string;
	parsedContent?: unknown;
	transient?: boolean;
	hiddenFromModel?: boolean;
	isEphemeralContext?: boolean;
	subAgent?: SubAgentExecutionState;
	subAgentStates?: Record<string, SubAgentExecutionState>;
}

export interface ChatMessage {
	id: string;
	role: ChatRole;
	content: string;
	timestamp: number;
	images?: string[];
	isError?: boolean;
	metadata?: ChatMessageMetadata;
	toolCalls?: ToolCall[];
	toolCallId?: string;
	modelTag?: string;
	modelName?: string;
	taskDescription?: string;
	executionIndex?: number;
	parallelGroupId?: string;
}

export interface ChatContextCompactionRange {
	endMessageId: string | null;
	messageCount: number;
	signature: string;
}

export interface ChatContextCompactionState {
	version: number;
	coveredRange: ChatContextCompactionRange;
	summary: string;
	historyTokenEstimate: number;
	contextSummary?: string;
	contextSourceSignature?: string;
	contextTokenEstimate?: number;
	totalTokenEstimate?: number;
	updatedAt: number;
	droppedReasoningCount: number;
	overflowedProtectedLayers?: boolean;
}

export interface ChatRequestTokenState {
	totalTokenEstimate: number;
	messageTokenEstimate: number;
	toolTokenEstimate: number;
	userTurnTokenEstimate?: number;
	updatedAt: number;
}

export type PlanTaskStatus = 'todo' | 'in_progress' | 'done' | 'skipped';

export interface PlanTask {
	name: string;
	status: PlanTaskStatus;
	acceptance_criteria: string[];
	outcome?: string;
}

export interface PlanSnapshot {
	title: string;
	description?: string;
	tasks: PlanTask[];
	summary: {
		total: number;
		todo: number;
		inProgress: number;
		done: number;
		skipped: number;
	};
}

export interface ChatSession {
	id: string;
	title: string;
	modelId: string;
	messages: ChatMessage[];
	createdAt: number;
	updatedAt: number;
	contextNotes?: string[];
	selectedImages?: string[];
	selectedFiles?: SelectedFile[];
	selectedFolders?: SelectedFolder[];
	filePath?: string;
	systemPrompt?: string;
	enableTemplateAsSystemPrompt?: boolean;
	multiModelMode?: MultiModelMode;
	activeCompareGroupId?: string;
	layoutMode?: LayoutMode;
	livePlan?: PlanSnapshot | null;
	contextCompaction?: ChatContextCompactionState | null;
	requestTokenState?: ChatRequestTokenState | null;
}

export type ChatOpenMode = 'sidebar' | 'left-sidebar' | 'tab' | 'window' | 'persistent-modal';

export type QuickActionPromptSource = 'custom' | 'template';

export type QuickActionType = 'normal' | 'group';

export interface QuickAction {
	id: string;
	name: string;
	prompt: string;
	promptSource: QuickActionPromptSource;
	templateFile?: string;
	modelTag?: string;
	actionType?: QuickActionType;
	isActionGroup?: boolean;
	children?: string[];
	showInToolbar: boolean;
	order: number;
	createdAt: number;
	updatedAt: number;
	useDefaultSystemPrompt?: boolean;
	customPromptRole?: 'system' | 'user';
}

export interface MessageManagementSettings {
	enabled: boolean;
	contextBudgetTokens?: number;
	historyBudgetTokens?: number;
	recentTurns: number;
	summaryModelTag?: string;
}

export interface ChatSettings {
	defaultModel: string;
	autosaveChat: boolean;
	openMode: ChatOpenMode;
	enableSystemPrompt: boolean;
	autoAddActiveFile: boolean;
	showRibbonIcon: boolean;
	enableChatTrigger: boolean;
	chatTriggerSymbol: string[];
	chatModalWidth: number;
	chatModalHeight: number;
	enableQuickActions: boolean;
	maxQuickActionButtons: number;
	quickActionsStreamOutput: boolean;
	quickActions?: QuickAction[];
	messageManagement: MessageManagementSettings;
}

export type McpToolMode = 'disabled' | 'auto' | 'manual';

export interface ChatState {
	activeSession: ChatSession | null;
	isGenerating: boolean;
	inputValue: string;
	selectedModelId: string | null;
	selectedModels: string[];
	enableReasoningToggle: boolean;
	enableWebSearchToggle: boolean;
	enableTemplateAsSystemPrompt: boolean;
	contextNotes: string[];
	selectedImages: string[];
	selectedFiles: SelectedFile[];
	selectedFolders: SelectedFolder[];
	selectedText?: string;
	error?: string;
	selectedPromptTemplate?: {
		path: string;
		name: string;
		content: string;
	};
	showTemplateSelector: boolean;
	shouldSaveHistory: boolean;
	mcpToolMode: McpToolMode;
	mcpSelectedServerIds: string[];
	activeCompareGroupId?: string;
	multiModelMode: MultiModelMode;
	parallelResponses?: ParallelResponseGroup;
	layoutMode: LayoutMode;
}

export type {
	CompareGroup,
	LayoutMode,
	MultiModelMode,
	ParallelResponseEntry,
	ParallelResponseGroup,
} from './types-multi-model';

export type { ToolCall } from './types-tools';