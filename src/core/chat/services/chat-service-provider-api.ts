import type { ProviderSettings } from 'src/types/provider';
import type { ToolDefinition } from 'src/types/tool';
import type { ToolCall } from '../types/tools';
import type { ChatMessage, ChatSession, MessageManagementSettings } from '../types/chat';
import type { ResolvedContextBudget } from 'src/core/chat/utils/context-budget';
import type { FileContentOptions } from './file-content-service';
import type { GenerateAssistantOptions } from './chat-service-types';
import type { ChatProviderMessageBuildOptions } from './chat-provider-message-facade';
import type { ChatServiceInternals } from './chat-service-internals';
import {
	detectChatImageGenerationIntent,
	findInstalledSkillDefinition,
	findProviderByTagExact,
	getDefaultProviderTag,
	getMaxToolCallLoops,
	getModelDisplayName,
	getOllamaCapabilities,
	getOllamaCapabilitiesForModel,
	isCurrentModelSupportImageGeneration,
	normalizeOllamaBaseUrl,
	normalizeToolExecutionRecord,
	providerSupportsImageGeneration,
	resolveProvider,
	resolveProviderByTag,
	resolveSkillsSystemPromptBlock,
	rethrowImageGenerationError,
	showMcpNoticeOnce,
} from './chat-service-deps-support';
import {
	getGenerationFacade,
	getProviderMessageFacade,
} from './chat-service-facades';

export const createChatServiceProviderApi = (internals: ChatServiceInternals) => ({
	getObsidianApiProvider() {
		return internals.obsidianApi;
	},
	getCurrentModelTag(): string | null {
		return internals.stateStore.getMutableState().selectedModelId ?? getDefaultProviderTag(internals);
	},
	getMaxToolCallLoops(): number | undefined {
		return getMaxToolCallLoops(internals);
	},
	createSubAgentStateUpdater(
		assistantMessage: ChatMessage,
		session: ChatSession,
		shouldAttachToSession: boolean,
	) {
		return (update: Parameters<typeof internals.service.createSubAgentStateUpdater>[0]) => {
			const metadata = { ...(assistantMessage.metadata ?? {}) };
			const subAgentStates = { ...(metadata.subAgentStates ?? {}) };
			subAgentStates[update.toolCallId] = update.state;
			assistantMessage.metadata = { ...metadata, subAgent: update.state, subAgentStates };
			const existingToolCalls = assistantMessage.toolCalls ?? [];
			const existingIndex = existingToolCalls.findIndex((record) => record.id === update.toolCallId);
			const nextRecord: ToolCall = {
				id: update.toolCallId,
				name: `sub_agent_${update.state.name}`,
				arguments: { task: update.task },
				result: internals.service.extractLatestSubAgentResult(update.state),
				status: update.state.status === 'running'
					? 'pending'
					: update.state.status === 'completed'
						? 'completed'
						: 'failed',
				timestamp: Date.now(),
			};
			if (existingIndex >= 0) {
				existingToolCalls[existingIndex] = nextRecord;
				assistantMessage.toolCalls = [...existingToolCalls];
			} else {
				assistantMessage.toolCalls = [...existingToolCalls, nextRecord];
			}
			session.updatedAt = Date.now();
			if (shouldAttachToSession) {
				internals.service.emitState();
			}
		};
	},
	findInstalledSkillDefinition(skillName: string) {
		return findInstalledSkillDefinition(internals, skillName);
	},
	normalizeToolExecutionRecord(record) {
		return normalizeToolExecutionRecord(internals, record);
	},
	async resolveSkillsSystemPromptBlock(requestTools: ToolDefinition[]) {
		return await resolveSkillsSystemPromptBlock(internals, requestTools);
	},
	extractLatestSubAgentResult(state: { status: string; internalMessages: ChatMessage[] }) {
		if (state.status === 'running') {
			return undefined;
		}
		const assistantMessages = state.internalMessages.filter((message) => message.role === 'assistant');
		return assistantMessages[assistantMessages.length - 1]?.content;
	},
	async resolveToolRuntime(options?: Parameters<typeof internals.toolRuntimeResolver.resolveToolRuntime>[0]) {
		return await internals.toolRuntimeResolver.resolveToolRuntime(options);
	},
	detectImageGenerationIntent(content: string): boolean {
		return detectChatImageGenerationIntent(content);
	},
	isCurrentModelSupportImageGeneration(): boolean {
		return isCurrentModelSupportImageGeneration(internals);
	},
	isProviderSupportImageGenerationByTag(modelTag: string): boolean {
		const provider = findProviderByTagExact(internals, modelTag);
		return provider ? providerSupportsImageGeneration(internals, provider) : false;
	},
	normalizeOllamaBaseUrl(baseURL?: string) {
		return normalizeOllamaBaseUrl(internals, baseURL);
	},
	async getOllamaCapabilities(baseURL: string, model: string) {
		return await getOllamaCapabilities(internals, baseURL, model);
	},
	async getOllamaCapabilitiesForModel(modelTag: string) {
		return await getOllamaCapabilitiesForModel(internals, modelTag);
	},
	showMcpNoticeOnce(message: string): void {
		showMcpNoticeOnce(internals, message);
	},
	providerSupportsImageGeneration(provider: ProviderSettings): boolean {
		return providerSupportsImageGeneration(internals, provider);
	},
	rethrowImageGenerationError(error: unknown): never {
		return rethrowImageGenerationError(error);
	},
	resolveProvider() {
		return resolveProvider(internals);
	},
	resolveProviderByTag(tag?: string) {
		return resolveProviderByTag(internals, tag);
	},
	findProviderByTagExact(tag?: string) {
		return findProviderByTagExact(internals, tag);
	},
	getDefaultProviderTag() {
		return getDefaultProviderTag(internals);
	},
	getModelDisplayName(provider: ProviderSettings): string {
		return getModelDisplayName(internals, provider);
	},
	getGenerationFacade() {
		return getGenerationFacade(internals);
	},
	getProviderMessageFacade() {
		return getProviderMessageFacade(internals);
	},
	async generateAssistantResponse(session: ChatSession): Promise<void> {
		await getGenerationFacade(internals).generateAssistantResponse(session);
	},
	async generateAssistantResponseForModel(
		session: ChatSession,
		modelTag: string,
		options?: GenerateAssistantOptions,
	) {
		return await getGenerationFacade(internals).generateAssistantResponseForModel(session, modelTag, options);
	},
	async buildProviderMessages(session: ChatSession) {
		return await getProviderMessageFacade(internals).buildProviderMessages(session);
	},
	async buildProviderMessagesWithOptions(
		session: ChatSession,
		options?: ChatProviderMessageBuildOptions,
	) {
		return await getProviderMessageFacade(internals).buildProviderMessagesWithOptions(session, options);
	},
	async buildProviderMessagesForAgent(messages: ChatMessage[], session: ChatSession, systemPrompt?: string, modelTag?: string, requestTools: ToolDefinition[] = []) {
		return await getProviderMessageFacade(internals).buildProviderMessagesForAgent(messages, session, systemPrompt, modelTag, requestTools);
	},
	getMessageManagementSettings(): MessageManagementSettings {
		return getProviderMessageFacade(internals).getMessageManagementSettings();
	},
	getDefaultFileContentOptions(): FileContentOptions {
		return getProviderMessageFacade(internals).getDefaultFileContentOptions();
	},
	getResolvedContextBudget(modelTag?: string | null): ResolvedContextBudget {
		return getProviderMessageFacade(internals).resolveContextBudget(modelTag);
	},
});
