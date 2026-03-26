import type { ProviderSettings } from 'src/types/provider';

export const OPENCHAT_INTERNAL_PARAMETER_PREFIX = '__openchat';
export const OPENCHAT_PROVIDER_GROUP_ID_KEY = '__openchatGroupId';
export const OPENCHAT_PROVIDER_BASE_TAG_KEY = '__openchatBaseTag';
export const OPENCHAT_PROVIDER_SOURCE_KEY = '__openchatProviderSource';

export type OpenChatProviderSource = 'preset' | 'custom';

export interface OpenChatProviderMetadata {
	groupId?: string;
	baseTag?: string;
	source?: OpenChatProviderSource;
}

export const isOpenChatInternalParameterKey = (key: string): boolean =>
	typeof key === 'string' && key.startsWith(OPENCHAT_INTERNAL_PARAMETER_PREFIX);

export const extractOpenChatProviderMetadata = (
	parameters?: Record<string, unknown>
): OpenChatProviderMetadata => {
	if (!parameters) {
		return {};
	}

	const source = parameters[OPENCHAT_PROVIDER_SOURCE_KEY];
	return {
		groupId:
			typeof parameters[OPENCHAT_PROVIDER_GROUP_ID_KEY] === 'string'
				? parameters[OPENCHAT_PROVIDER_GROUP_ID_KEY]
				: undefined,
		baseTag:
			typeof parameters[OPENCHAT_PROVIDER_BASE_TAG_KEY] === 'string'
				? parameters[OPENCHAT_PROVIDER_BASE_TAG_KEY]
				: undefined,
		source: source === 'custom' || source === 'preset' ? source : undefined,
	};
};

export const getOpenChatProviderDisplayName = (
	tag: string,
	parameters?: Record<string, unknown>
): string => {
	const metadata = extractOpenChatProviderMetadata(parameters);
	const baseTag = typeof metadata.baseTag === 'string' ? metadata.baseTag.trim() : '';
	return baseTag || tag;
};

export const isCustomOpenChatProvider = (
	parameters?: Record<string, unknown>
): boolean => extractOpenChatProviderMetadata(parameters).source === 'custom';

export const getProviderModelDisplayName = (
	provider: Pick<ProviderSettings, 'tag' | 'vendor' | 'options'>,
	providers?: Array<Pick<ProviderSettings, 'tag' | 'vendor' | 'options'>>
): string => {
	const modelName = typeof provider.options?.model === 'string'
		? provider.options.model.trim()
		: '';
	const baseName = modelName || provider.tag;
	if (!providers || !baseName) {
		return baseName;
	}
	const normalizedBaseName = baseName.toLowerCase();
	const hasConflict = providers.some((candidate) => {
		if (candidate.tag === provider.tag) {
			return false;
		}
		const candidateName = typeof candidate.options?.model === 'string'
			? candidate.options.model.trim()
			: candidate.tag;
		return candidateName.toLowerCase() === normalizedBaseName;
	});
	return hasConflict ? `${baseName} · ${provider.vendor}` : baseName;
};

export const stripInternalProviderParameters = (
	parameters?: Record<string, unknown>
): Record<string, unknown> => {
	if (!parameters) {
		return {};
	}

	const next: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(parameters)) {
		if (isOpenChatInternalParameterKey(key)) {
			continue;
		}
		next[key] = value;
	}

	return next;
};

export const mergeProviderParametersWithMetadata = (
	parameters: Record<string, unknown> | undefined,
	metadata: OpenChatProviderMetadata
): Record<string, unknown> => {
	const next = stripInternalProviderParameters(parameters);

	if (metadata.groupId) {
		next[OPENCHAT_PROVIDER_GROUP_ID_KEY] = metadata.groupId;
	}
	if (metadata.baseTag) {
		next[OPENCHAT_PROVIDER_BASE_TAG_KEY] = metadata.baseTag;
	}
	if (metadata.source) {
		next[OPENCHAT_PROVIDER_SOURCE_KEY] = metadata.source;
	}

	return next;
};

export const createProviderGroupId = (): string =>
	`provider-group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const sanitizeTagFragment = (value: string): string => {
	const normalized = value
		.trim()
		.replace(/\s+/g, '-')
		.replace(/#/g, '-')
		.replace(/[^a-zA-Z0-9-_.]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');

	return normalized.toLowerCase();
};
