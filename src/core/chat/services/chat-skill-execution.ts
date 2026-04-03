import { v4 as uuidv4 } from 'uuid';
import {
	SkillExecutionService,
	type SkillExecutionContext,
	type SkillExecutionRunResult,
} from 'src/domains/skills/execution';
import { freezeMainTaskFrame } from 'src/domains/skills/session-state';
import type { MainTaskFrame } from 'src/domains/skills/session-state';
import type { ChatMessage, ChatSession } from '../types/chat';
import type { ChatServiceInternals } from './chat-service-internals';

const createDetachedSkillSession = (
	internals: ChatServiceInternals,
	context: SkillExecutionContext,
	mainTaskFrame: MainTaskFrame,
): ChatSession => {
	const now = Date.now();
	const modelId =
		internals.service.getCurrentModelTag()
		?? internals.service.getDefaultProviderTag()
		?? '';
	return {
		id: `skill-session-${uuidv4()}`,
		title: `Skill: ${context.skill.metadata.name}`,
		modelId,
		messages: [],
		createdAt: now,
		updatedAt: now,
		contextNotes: [...mainTaskFrame.state.contextNotes],
		selectedImages: [...mainTaskFrame.state.selectedImages],
		selectedFiles: [...mainTaskFrame.state.selectedFiles],
		selectedFolders: [...mainTaskFrame.state.selectedFolders],
		multiModelMode: 'single',
		layoutMode: mainTaskFrame.state.layoutMode,
		livePlan: null,
		contextCompaction: null,
		requestTokenState: null,
	};
};

const buildSkillUserMessageContent = (
	skillName: string,
	argsText: string,
): string => {
	const commandTag = `[[${skillName}]]`;
	return argsText ? `${argsText}\n\n${commandTag}` : commandTag;
};

const buildMainTaskContext = (mainTaskFrame: MainTaskFrame): string | undefined => {
	const parts: string[] = [];
	const state = mainTaskFrame.state;
	const latestUserMessage = [...(state.activeSession?.messages ?? [])]
		.reverse()
		.find((message) => message.role === 'user' && !message.metadata?.hiddenFromModel);
	if (state.inputValue.trim()) {
		parts.push(`主任务当前输入：\n${state.inputValue.trim()}`);
	}
	if (latestUserMessage?.content.trim()) {
		parts.push(`主任务最近用户消息：\n${latestUserMessage.content.trim()}`);
	}
	if (state.selectedText?.trim()) {
		parts.push(`主任务选中文本：\n${state.selectedText.trim()}`);
	}
	if (state.contextNotes.length > 0) {
		parts.push(`主任务上下文备注：\n- ${state.contextNotes.join('\n- ')}`);
	}
	if (state.selectedFiles.length > 0) {
		parts.push(`主任务已选文件：\n- ${state.selectedFiles.map((file) => file.path).join('\n- ')}`);
	}
	if (state.selectedFolders.length > 0) {
		parts.push(`主任务已选目录：\n- ${state.selectedFolders.map((folder) => folder.path).join('\n- ')}`);
	}
	return parts.length > 0 ? parts.join('\n\n') : undefined;
};

const buildSkillUserMessage = (
	internals: ChatServiceInternals,
	context: SkillExecutionContext,
	mainTaskFrame: MainTaskFrame,
): ChatMessage => {
	return internals.messageService.createMessage(
		'user',
		buildSkillUserMessageContent(context.skill.metadata.name, context.argsText),
		{
			images: [...mainTaskFrame.state.selectedImages],
			metadata: {
				taskUserInput: context.argsText,
				taskTemplate: context.loadedSkill.bodyContent,
				selectedText: mainTaskFrame.state.selectedText,
				selectedTextContext: mainTaskFrame.state.selectedTextContext,
			},
		},
	);
};

const findLatestAssistantMessage = (
	session: ChatSession,
	minimumCount = 0,
): ChatMessage | null => {
	const assistantMessages = session.messages.filter((message) => message.role === 'assistant');
	if (assistantMessages.length <= minimumCount) {
		return null;
	}
	return assistantMessages[assistantMessages.length - 1] ?? null;
};

const resolveSkillToolRuntime = async (
	internals: ChatServiceInternals,
	context: SkillExecutionContext,
	session: ChatSession,
) => {
	const explicitToolNames = context.skill.metadata.allowed_tools?.filter(Boolean);
	if (!explicitToolNames || explicitToolNames.length === 0) {
		return undefined;
	}
	return await internals.service.resolveToolRuntime({
		explicitToolNames: [...explicitToolNames],
		parentSessionId: session.id,
		session,
	});
};

const executeInlineWithChatService = async (
	internals: ChatServiceInternals,
	context: SkillExecutionContext,
): Promise<SkillExecutionRunResult> => {
	const state = internals.stateStore.getMutableState();
	const activeSession = state.activeSession ?? internals.service.createNewSession();
	const previousAssistantCount = activeSession.messages
		.filter((message) => message.role === 'assistant')
		.length;
	state.selectedPromptTemplate = {
		name: context.skill.metadata.name,
		path: context.skill.skillFilePath,
		content: context.loadedSkill.bodyContent,
	};
	await internals.service.sendMessage(context.argsText);
	const latestAssistant = findLatestAssistantMessage(activeSession, previousAssistantCount);
	if (!latestAssistant) {
		return {
			status: 'failed',
			content: `Skill "${context.skill.metadata.name}" 内联执行未生成回复。`,
			sessionId: activeSession.id,
			messageCount: activeSession.messages.length,
			metadata: {
				executionMode: context.executionMode,
				trigger: context.request.trigger ?? 'manual_test',
			},
		};
	}
	return {
		content: latestAssistant.content,
		sessionId: activeSession.id,
		messageCount: activeSession.messages.length,
		metadata: {
			executionMode: context.executionMode,
			trigger: context.request.trigger ?? 'manual_test',
		},
	};
};

const executeIsolatedWithChatService = async (
	internals: ChatServiceInternals,
	context: SkillExecutionContext,
): Promise<SkillExecutionRunResult> => {
	const mainTaskFrame =
		context.invocationFrame?.mainTask
		?? freezeMainTaskFrame(internals.stateStore.getMutableState());
	const session = createDetachedSkillSession(internals, context, mainTaskFrame);
	const userMessage = buildSkillUserMessage(internals, context, mainTaskFrame);
	session.messages.push(userMessage);
	session.updatedAt = Date.now();
	const modelTag =
		internals.service.getCurrentModelTag()
		?? internals.service.getDefaultProviderTag();
	if (!modelTag) {
		return {
			status: 'failed',
			content: '未找到可用于执行 Skill 的模型配置。',
			sessionId: session.id,
			messageCount: session.messages.length,
			metadata: {
				executionMode: context.executionMode,
				trigger: context.request.trigger ?? 'manual_test',
			},
		};
	}
	const toolRuntimeOverride = await resolveSkillToolRuntime(internals, context, session);
	const assistantMessage = await internals.service.generateAssistantResponseForModel(
		session,
		modelTag,
		{
			context: buildMainTaskContext(mainTaskFrame),
			taskDescription: `执行 Skill: ${context.skill.metadata.name}`,
			createMessageInSession: true,
			manageGeneratingState: false,
			toolRuntimeOverride,
		},
	);
	return {
		content: assistantMessage.content,
		sessionId: session.id,
		messageCount: session.messages.length,
		metadata: {
			executionMode: context.executionMode,
			trigger: context.request.trigger ?? 'manual_test',
			modelTag,
			allowedTools: context.skill.metadata.allowed_tools
				? [...context.skill.metadata.allowed_tools]
				: [],
		},
	};
};

export const createChatSkillExecutionService = (
	internals: ChatServiceInternals,
): SkillExecutionService => {
	return new SkillExecutionService(
		{
			findByName: (name, options) => {
				return internals.runtimeDeps.getSkillScannerService()?.findByName(name, options);
			},
			scan: async () => {
				await internals.runtimeDeps.ensureSkillsInitialized();
				return await internals.runtimeDeps.scanSkills();
			},
			loadSkillContent: async (path) => {
				await internals.runtimeDeps.ensureSkillsInitialized();
				const scanner = internals.runtimeDeps.getSkillScannerService();
				if (!scanner) {
					throw new Error('Skill scanner 尚未初始化。');
				}
				return await scanner.loadSkillContent(path);
			},
		},
		{
			executeInline: async (context) => await executeInlineWithChatService(internals, context),
			executeIsolated: async (context) =>
				await executeIsolatedWithChatService(internals, context),
			freezeMainTask: (input) => internals.service.freezeSkillMainTask(input),
			writeReturnPacket: (input) => internals.service.writeActiveSkillReturnPacket(input),
			restoreMainTask: () => internals.service.restoreSkillMainTask(),
		},
	);
};
