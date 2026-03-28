import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CHAT_SETTINGS } from 'src/domains/chat/config';
import {
	createChatProviderMessageFacade,
} from './chatProviderMessageFacade';
import { getChatMessageManagementSettings } from 'src/domains/chat/service-provider-message-support';
import type { ChatProviderMessageDeps } from './chatProviderMessages';
import type { ChatSettings, ChatState } from '../types/chat';

const createProviderMessageDeps = (
	settings: ChatSettings,
	pluginChatSettings: ChatSettings,
): ChatProviderMessageDeps => ({
	app: null as never,
	state: {
		contextNotes: [],
		multiModelMode: 'single',
		selectedModelId: null,
	} satisfies Pick<ChatState, 'contextNotes' | 'multiModelMode' | 'selectedModelId'>,
	settings,
	pluginChatSettings,
	messageService: null as never,
	messageContextOptimizer: null as never,
	contextCompactionService: null as never,
	getDefaultProviderTag: () => null,
	resolveProviderByTag: () => null,
	findProviderByTagExact: () => null,
	resolveSkillsSystemPromptBlock: async () => undefined,
	persistSessionContextCompactionFrontmatter: async () => {},
});

test('createChatProviderMessageFacade 每次调用都读取最新 settings 快照', () => {
	let settings: ChatSettings = {
		...DEFAULT_CHAT_SETTINGS,
		messageManagement: {
			...DEFAULT_CHAT_SETTINGS.messageManagement,
			recentTurns: 2,
		},
	};
	let pluginChatSettings: ChatSettings = {
		...DEFAULT_CHAT_SETTINGS,
		messageManagement: {
			...DEFAULT_CHAT_SETTINGS.messageManagement,
			recentTurns: 4,
		},
	};
	let getterCalls = 0;

	const facade = createChatProviderMessageFacade(() => {
		getterCalls += 1;
		return createProviderMessageDeps(settings, pluginChatSettings);
	}, {
		buildProviderMessages: async () => [],
		buildProviderMessagesWithOptions: async () => [],
		buildProviderMessagesForAgent: async () => [],
		getMessageManagementSettings: getChatMessageManagementSettings,
		getDefaultFileContentOptions: () => ({
			maxFileSize: 1024 * 1024,
			maxContentLength: 10000,
			includeExtensions: [],
			excludeExtensions: [],
			excludePatterns: [],
		}),
		resolveContextBudget: () => ({
			contextLength: 1,
			reserveForOutput: 1,
			usableInputTokens: 1,
			triggerTokens: 1,
			targetTokens: 1,
			triggerRatio: 0.75,
			targetRatio: 0.45,
		}),
	});

	assert.equal(facade.getMessageManagementSettings().recentTurns, 4);

	settings = {
		...settings,
		messageManagement: {
			...settings.messageManagement,
			recentTurns: 3,
		},
	};
	pluginChatSettings = {
		...pluginChatSettings,
		messageManagement: {
			...pluginChatSettings.messageManagement,
			recentTurns: 6,
			summaryModelTag: 'claude',
		},
	};

	const refreshedSettings = facade.getMessageManagementSettings();
	assert.equal(refreshedSettings.recentTurns, 6);
	assert.equal(refreshedSettings.summaryModelTag, 'claude');
	assert.equal(getterCalls, 2);
});