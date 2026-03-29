import { availableVendors } from 'src/domains/settings/config-ai-runtime-vendors';
import type { ProviderSettings, ResolveEmbedAsBinary } from 'src/types/provider';

interface RunSummaryModelRequestParams {
	modelTag: string;
	systemPrompt: string;
	userPrompt: string;
	maxTokens: number;
	findProviderByTagExact: (tag: string) => ProviderSettings | null;
}

export const runSummaryModelRequest = async (
	params: RunSummaryModelRequestParams
): Promise<string | null> => {
	try {
		const provider = params.findProviderByTagExact(params.modelTag);
		if (!provider) {
			return null;
		}

		const vendor = availableVendors.find((item) => item.name === provider.vendor);
		if (!vendor) {
			return null;
		}

		const providerOptionsRaw = (provider.options as Record<string, unknown>) ?? {};
		const summaryOptions: Record<string, unknown> = {
			...providerOptionsRaw,
			parameters: {
				...((providerOptionsRaw.parameters as Record<string, unknown> | undefined) ?? {}),
				temperature: 0.1,
				max_tokens: params.maxTokens,
			},
			enableReasoning: false,
			enableThinking: false,
			enableWebSearch: false,
			tools: [],
			toolExecutor: undefined,
			getTools: undefined,
			maxToolCallLoops: undefined,
			mcpTools: undefined,
			mcpGetTools: undefined,
			mcpCallTool: undefined,
			mcpMaxToolCallLoops: undefined,
		};
		if (typeof providerOptionsRaw.thinkingType === 'string') {
			summaryOptions.thinkingType = 'disabled';
		}

		const sendRequest = vendor.sendRequestFunc(summaryOptions as ProviderSettings['options']);
		const controller = new AbortController();
		const resolveEmbed: ResolveEmbedAsBinary = async () => new ArrayBuffer(0);
		let output = '';
		for await (const chunk of sendRequest(
			[
				{ role: 'system', content: params.systemPrompt },
				{ role: 'user', content: params.userPrompt },
			],
			controller,
			resolveEmbed
		)) {
			output += chunk;
		}
		const trimmed = output.trim();
		return trimmed.length > 0 ? trimmed : null;
	} catch {
		return null;
	}
};
