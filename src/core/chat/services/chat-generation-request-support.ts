import type {
	BaseOptions,
	ProviderSettings,
	ResolveEmbedAsBinary,
	SaveAttachment,
} from 'src/types/provider';
import type { ToolExecutionRecord } from 'src/types/tool';
import type { ChatMessage, ChatSession } from '../types/chat';
import type { GenerateAssistantOptions } from './chat-service-types';
import type { ChatGenerationDeps } from './chat-generation';

export const updateAssistantToolCallRecord = (
	deps: ChatGenerationDeps,
	assistantMessage: ChatMessage,
	session: ChatSession,
	record: ToolExecutionRecord,
	shouldAttachToSession: boolean,
	onToolCallRecord?: (record: ToolExecutionRecord) => void,
): void => {
	const normalizedRecord = deps.normalizeToolExecutionRecord(record);
	const existingToolCalls = assistantMessage.toolCalls ?? [];
	const existingIndex = existingToolCalls.findIndex(
		(item) => item.id === normalizedRecord.id,
	);
	if (existingIndex >= 0) {
		existingToolCalls[existingIndex] = normalizedRecord;
		assistantMessage.toolCalls = [...existingToolCalls];
	} else {
		assistantMessage.toolCalls = [...existingToolCalls, normalizedRecord];
	}
	onToolCallRecord?.(normalizedRecord);
	session.updatedAt = Date.now();
	if (shouldAttachToSession) {
		deps.emitState();
	}
};

export const createResolveEmbed = (
	deps: Pick<ChatGenerationDeps, 'imageResolver'>,
): ResolveEmbedAsBinary => {
	return async (embed) => {
		const embedRecord = embed as Record<symbol, unknown> | null;
		const rawBase64Data = embedRecord?.[Symbol.for('originalBase64')];
		const base64Data =
			typeof rawBase64Data === 'string' ? rawBase64Data : undefined;
		if (base64Data) {
			return deps.imageResolver.base64ToArrayBuffer(base64Data);
		}
		return new ArrayBuffer(0);
	};
};

export const createSaveAttachment = (
	deps: Pick<ChatGenerationDeps, 'getAvailableAttachmentPath' | 'writeVaultBinary'>,
): SaveAttachment => {
	return async (filename: string, data: ArrayBuffer): Promise<void> => {
		const attachmentPath = await deps.getAvailableAttachmentPath(filename);
		await deps.writeVaultBinary(attachmentPath, data);
	};
};

export const buildProviderOptions = (
	deps: ChatGenerationDeps,
	provider: ProviderSettings,
	options: GenerateAssistantOptions | undefined,
): {
	providerOptions: BaseOptions;
	enableReasoning: boolean;
	enableThinking: boolean;
	enableWebSearch: boolean;
} => {
	const providerOptionsRaw = provider.options ?? {};
	const providerEnableReasoning =
		typeof providerOptionsRaw.enableReasoning === 'boolean'
			? providerOptionsRaw.enableReasoning
			: provider.vendor === 'Doubao'
				? String(providerOptionsRaw.thinkingType ?? 'enabled') !== 'disabled'
				: false;
	const providerEnableThinking = providerOptionsRaw.enableThinking ?? false;
	const providerEnableWebSearch = provider.options.enableWebSearch ?? false;
	const enableReasoning = deps.state.enableReasoningToggle && providerEnableReasoning;
	const enableThinking = deps.state.enableReasoningToggle && providerEnableThinking;
	const enableWebSearch = deps.state.enableWebSearchToggle && providerEnableWebSearch;
	const providerOptions: BaseOptions = {
		...(providerOptionsRaw as BaseOptions),
		enableReasoning,
		enableThinking,
		enableWebSearch,
		apiKey: String(providerOptionsRaw.apiKey ?? ''),
		baseURL: String(providerOptionsRaw.baseURL ?? ''),
		model: String(providerOptionsRaw.model ?? ''),
		parameters:
			(providerOptionsRaw.parameters as Record<string, unknown> | undefined) ?? {},
	};
	if (!enableReasoning && typeof providerOptionsRaw.thinkingType === 'string') {
		providerOptions.thinkingType = 'disabled';
	}
	if (typeof options?.maxTokensOverride === 'number' && options.maxTokensOverride > 0) {
		providerOptions.max_tokens = options.maxTokensOverride;
	}
	return {
		providerOptions,
		enableReasoning,
		enableThinking,
		enableWebSearch,
	};
};
