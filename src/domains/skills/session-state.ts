import { v4 as uuidv4 } from 'uuid';
import type {
	ChatSession,
	ChatState,
	LayoutMode,
	MultiModelMode,
	ParallelResponseGroup,
	SelectedFile,
	SelectedFolder,
	SelectedTextContext,
} from 'src/domains/chat/types';
import type { SkillExecutionMode } from './types';

export type SkillInvocationStatus = 'running' | 'returned';

export type SkillReturnStatus = 'completed' | 'failed' | 'cancelled';

export interface MainTaskStateSnapshot {
	readonly activeSession: ChatSession | null;
	readonly inputValue: string;
	readonly selectedModelId: string | null;
	readonly selectedModels: string[];
	readonly enableReasoningToggle: boolean;
	readonly enableWebSearchToggle: boolean;
	readonly contextNotes: string[];
	readonly selectedImages: string[];
	readonly selectedFiles: SelectedFile[];
	readonly selectedFolders: SelectedFolder[];
	readonly selectedText?: string;
	readonly selectedTextContext?: SelectedTextContext;
	readonly error?: string;
	readonly selectedPromptTemplate?: {
		path: string;
		name: string;
		content: string;
	};
	readonly shouldSaveHistory: boolean;
	readonly multiModelMode: MultiModelMode;
	readonly parallelResponses?: ParallelResponseGroup;
	readonly layoutMode: LayoutMode;
}

export interface MainTaskFrame {
	readonly frameId: string;
	readonly sessionId: string | null;
	readonly capturedAt: number;
	readonly state: MainTaskStateSnapshot;
}

export interface SkillReturnPacket {
	readonly invocationId: string;
	readonly skillId: string;
	readonly skillName: string;
	readonly status: SkillReturnStatus;
	readonly content: string;
	readonly sessionId: string | null;
	readonly messageCount: number;
	readonly producedAt: number;
	readonly metadata?: Record<string, unknown>;
}

export interface SkillInvocationFrame {
	readonly invocationId: string;
	readonly skillId: string;
	readonly skillName: string;
	readonly skillFilePath?: string;
	readonly executionMode: SkillExecutionMode;
	readonly startedAt: number;
	readonly updatedAt: number;
	readonly status: SkillInvocationStatus;
	readonly mainTask: MainTaskFrame;
	readonly isolatedSession: ChatSession | null;
	readonly returnPacket: SkillReturnPacket | null;
}

export interface SkillSessionState {
	readonly activeInvocation: SkillInvocationFrame | null;
	readonly updatedAt: number;
}

export interface BeginSkillInvocationInput {
	readonly skillId: string;
	readonly skillName: string;
	readonly skillFilePath?: string;
	readonly executionMode: SkillExecutionMode;
	readonly isolatedSession?: ChatSession | null;
	readonly invocationId?: string;
	readonly timestamp?: number;
}

export interface WriteSkillReturnPacketInput {
	readonly invocationId?: string;
	readonly status: SkillReturnStatus;
	readonly content: string;
	readonly sessionId?: string | null;
	readonly messageCount?: number;
	readonly producedAt?: number;
	readonly metadata?: Record<string, unknown>;
}

const cloneValue = <T>(value: T): T => {
	if (value === undefined) {
		return value;
	}
	return JSON.parse(JSON.stringify(value)) as T;
};

const cloneStateSnapshot = (state: ChatState): MainTaskStateSnapshot => ({
	activeSession: cloneValue(state.activeSession),
	inputValue: state.inputValue,
	selectedModelId: state.selectedModelId,
	selectedModels: [...state.selectedModels],
	enableReasoningToggle: state.enableReasoningToggle,
	enableWebSearchToggle: state.enableWebSearchToggle,
	contextNotes: [...state.contextNotes],
	selectedImages: [...state.selectedImages],
	selectedFiles: cloneValue(state.selectedFiles),
	selectedFolders: cloneValue(state.selectedFolders),
	selectedText: state.selectedText,
	selectedTextContext: cloneValue(state.selectedTextContext),
	error: state.error,
	selectedPromptTemplate: cloneValue(state.selectedPromptTemplate),
	shouldSaveHistory: state.shouldSaveHistory,
	multiModelMode: state.multiModelMode,
	parallelResponses: cloneValue(state.parallelResponses),
	layoutMode: state.layoutMode,
});

export const freezeMainTaskFrame = (
	state: ChatState,
	capturedAt = Date.now(),
): MainTaskFrame => ({
	frameId: `main-task-${uuidv4()}`,
	sessionId: state.activeSession?.id ?? null,
	capturedAt,
	state: cloneStateSnapshot(state),
});

export const beginSkillSession = (
	state: ChatState,
	input: BeginSkillInvocationInput,
): SkillSessionState => {
	const startedAt = input.timestamp ?? Date.now();
	return {
		activeInvocation: {
			invocationId: input.invocationId ?? `skill-invocation-${uuidv4()}`,
			skillId: input.skillId,
			skillName: input.skillName,
			skillFilePath: input.skillFilePath,
			executionMode: input.executionMode,
			startedAt,
			updatedAt: startedAt,
			status: 'running',
			mainTask: freezeMainTaskFrame(state, startedAt),
			isolatedSession: cloneValue(input.isolatedSession ?? null),
			returnPacket: null,
		},
		updatedAt: startedAt,
	};
};

export const writeSkillReturnPacket = (
	sessionState: SkillSessionState | null | undefined,
	input: WriteSkillReturnPacketInput,
): SkillSessionState => {
	const activeInvocation = sessionState?.activeInvocation;
	if (!activeInvocation) {
		throw new Error('当前没有可写入返回包的 Skill 调用帧');
	}
	if (
		input.invocationId
		&& input.invocationId !== activeInvocation.invocationId
	) {
		throw new Error('Skill 返回包 invocationId 与当前活动调用不匹配');
	}
	const producedAt = input.producedAt ?? Date.now();
	const returnPacket: SkillReturnPacket = {
		invocationId: activeInvocation.invocationId,
		skillId: activeInvocation.skillId,
		skillName: activeInvocation.skillName,
		status: input.status,
		content: input.content,
		sessionId: input.sessionId ?? activeInvocation.isolatedSession?.id ?? null,
		messageCount: input.messageCount ?? activeInvocation.isolatedSession?.messages.length ?? 0,
		producedAt,
		metadata: input.metadata ? cloneValue(input.metadata) : undefined,
	};
	return {
		activeInvocation: {
			...activeInvocation,
			status: 'returned',
			updatedAt: producedAt,
			returnPacket,
		},
		updatedAt: producedAt,
	};
};

export const restoreMainTaskState = (
	state: ChatState,
	sessionState: SkillSessionState | null | undefined,
): SkillReturnPacket | null => {
	const activeInvocation = sessionState?.activeInvocation;
	if (!activeInvocation) {
		return null;
	}
	const snapshot = activeInvocation.mainTask.state;
	state.activeSession = cloneValue(snapshot.activeSession);
	state.inputValue = snapshot.inputValue;
	state.selectedModelId = snapshot.selectedModelId;
	state.selectedModels = [...snapshot.selectedModels];
	state.enableReasoningToggle = snapshot.enableReasoningToggle;
	state.enableWebSearchToggle = snapshot.enableWebSearchToggle;
	state.contextNotes = [...snapshot.contextNotes];
	state.selectedImages = [...snapshot.selectedImages];
	state.selectedFiles = cloneValue(snapshot.selectedFiles);
	state.selectedFolders = cloneValue(snapshot.selectedFolders);
	state.selectedText = snapshot.selectedText;
	state.selectedTextContext = cloneValue(snapshot.selectedTextContext);
	state.error = snapshot.error;
	state.selectedPromptTemplate = cloneValue(snapshot.selectedPromptTemplate);
	state.shouldSaveHistory = snapshot.shouldSaveHistory;
	state.multiModelMode = snapshot.multiModelMode;
	state.parallelResponses = cloneValue(snapshot.parallelResponses);
	state.layoutMode = snapshot.layoutMode;
	state.isGenerating = false;
	state.skillSessionState = null;
	return cloneValue(activeInvocation.returnPacket);
};
