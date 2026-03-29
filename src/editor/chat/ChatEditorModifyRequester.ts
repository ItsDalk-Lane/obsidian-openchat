import type { ChatMessage } from 'src/domains/chat/types';
import { availableVendors } from 'src/domains/settings/config-ai-runtime-vendors';
import { buildProviderOptionsWithReasoningDisabled } from 'src/LLMProviders/utils';
import { PromptBuilder } from 'src/core/services/PromptBuilder';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { Message as ProviderMessage } from 'src/types/provider';
import type { ProviderSettings } from 'src/types/provider';
import type { ObsidianApiProvider } from 'src/providers/providers.types';

/**
 * 请求 AI 修改文本（独立辅助函数，从 ChatEditorIntegration 提取）
 */
export async function requestModifyTextHelper(
	obsidianApi: ObsidianApiProvider,
	provider: ProviderSettings,
	instruction: string,
	content: string,
): Promise<string> {
	const vendor = availableVendors.find(v => v.name === provider.vendor);
	if (!vendor) {
		throw new Error(`未知的模型供应商: ${provider.vendor}`);
	}

	const globalSystemPrompt = (
		await obsidianApi.buildGlobalSystemPrompt('selection_toolbar')
	).trim();

	const userInstruction = `任务：根据用户指令修改输入文本。\n\n规则：\n1. 仅输出修改后的最终文本，不要解释\n2. 保持原文语言\n3. 保留 Markdown 结构（如有）\n\n用户指令：\n${instruction}`;

	const taskMessage: ChatMessage = {
		id: 'modify-task',
		role: 'user',
		content: userInstruction,
		timestamp: Date.now(),
		images: [],
		isError: false,
		metadata: {
			taskUserInput: instruction,
			taskTemplate: null,
			selectedText: content
		}
	};

	const promptBuilder = new PromptBuilder({
		getActiveFilePath: () => obsidianApi.getActiveFilePath(),
	});
	const sourcePath = obsidianApi.getActiveFilePath() ?? '';
	const messages: ProviderMessage[] = await promptBuilder.buildChatProviderMessages([taskMessage], {
		systemPrompt: globalSystemPrompt.length > 0 ? globalSystemPrompt : undefined,
		sourcePath,
		maxHistoryRounds: 0
	});

	const controller = new AbortController();
	const resolveEmbed = async () => new ArrayBuffer(0);
	const providerOptions = buildProviderOptionsWithReasoningDisabled(provider.options, provider.vendor);
	const sendRequest = vendor.sendRequestFunc(providerOptions);
	DebugLogger.logLlmMessages('ChatEditorIntegration.requestModifyText', messages, { level: 'debug' });
	let output = '';
	for await (const chunk of sendRequest(messages, controller, resolveEmbed)) {
		output += chunk;
		if (controller.signal.aborted) {
			break;
		}
	}
	DebugLogger.logLlmResponsePreview('ChatEditorIntegration.requestModifyText', output, { level: 'debug', previewChars: 100 });
	return output.trim();
}
