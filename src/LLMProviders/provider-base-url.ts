import { normalizeZhipuOpenAIBaseURL, zhipuVendor } from './zhipu';

export const normalizeOllamaBaseURL = (baseURL?: string): string => {
	const trimmed = (baseURL || '').trim();
	return trimmed
		? (trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed)
		: 'http://127.0.0.1:11434';
};

export const normalizeProviderBaseURLForRuntime = (
	vendorName: string,
	baseURL?: string,
): string => {
	const trimmed = (baseURL || '').trim();
	if (vendorName === 'Ollama') {
		return normalizeOllamaBaseURL(trimmed);
	}
	if (vendorName === zhipuVendor.name) {
		return normalizeZhipuOpenAIBaseURL(trimmed);
	}
	return trimmed;
};
