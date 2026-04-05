import type { ProviderSettings, Vendor, BaseOptions } from 'src/types/provider';
import {
	createProviderGroupId,
	extractOpenChatProviderMetadata,
	mergeProviderParametersWithMetadata,
	sanitizeTagFragment,
	stripInternalProviderParameters,
	type OpenChatProviderSource,
} from 'src/utils/aiProviderMetadata';

export interface ProviderGroupRecord {
	id: string;
	indices: number[];
	vendorName: string;
	protocolVendorName: string;
	source: OpenChatProviderSource;
	baseTag: string;
	displayName: string;
	providers: Array<{ index: number; settings: ProviderSettings }>;
}

export interface ProviderModelDraft {
	id: string;
	tag: string;
	options: BaseOptions;
}

export interface ProviderGroupDraft {
	groupId: string;
	mode: 'create' | 'edit';
	source: OpenChatProviderSource;
	selectedVendorName: string;
	protocolVendorName: string;
	baseTag: string;
	baseURL: string;
	apiKey: string;
	contextLength?: number;
	parameters: Record<string, unknown>;
	models: ProviderModelDraft[];
	activeModelId?: string;
	existingIndices: number[];
}

const cloneValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const getGroupDisplayName = (
	vendorName: string,
	protocolVendorName: string,
	source: OpenChatProviderSource
): string => (source === 'custom' ? protocolVendorName : vendorName);

export const buildProviderGroups = (providers: ProviderSettings[]): ProviderGroupRecord[] => {
	const groups = new Map<string, ProviderGroupRecord>();

	providers.forEach((provider, index) => {
		const metadata = extractOpenChatProviderMetadata(provider.options.parameters);
		const groupId = metadata.groupId ?? `legacy-${index}`;
		const source = metadata.source ?? 'preset';
		const baseTag = metadata.baseTag ?? provider.tag;
		const protocolVendorName = source === 'custom'
			? String(provider.options.parameters?.protocolVendorName ?? provider.vendor)
			: provider.vendor;
		const existing = groups.get(groupId);
		if (existing) {
			existing.indices.push(index);
			existing.providers.push({ index, settings: provider });
			return;
		}

		groups.set(groupId, {
			id: groupId,
			indices: [index],
			vendorName: provider.vendor,
			protocolVendorName,
			source,
			baseTag,
			displayName: getGroupDisplayName(provider.vendor, protocolVendorName, source),
			providers: [{ index, settings: provider }],
		});
	});

	return Array.from(groups.values()).sort((left, right) => left.indices[0] - right.indices[0]);
};

export const createDraftFromGroup = (group: ProviderGroupRecord): ProviderGroupDraft => {
	const firstProvider = group.providers[0]?.settings;
	const firstOptions = firstProvider?.options ?? ({} as BaseOptions);
	const models = group.providers.map(({ index, settings }) => ({
		id: `existing-${index}`,
		tag: settings.tag,
		options: cloneValue(settings.options),
	}));

	return {
		groupId: group.id,
		mode: 'edit',
		source: group.source,
		selectedVendorName: group.source === 'custom' ? 'Custom' : group.vendorName,
		protocolVendorName: group.protocolVendorName,
		baseTag: group.baseTag,
		baseURL: firstOptions.baseURL ?? '',
		apiKey: firstOptions.apiKey ?? '',
		contextLength: typeof firstOptions.contextLength === 'number' ? firstOptions.contextLength : undefined,
		parameters: stripInternalProviderParameters(firstOptions.parameters),
		models,
		activeModelId: models[0]?.id,
		existingIndices: [...group.indices],
	};
};

export const createEmptyDraft = (): ProviderGroupDraft => ({
	groupId: createProviderGroupId(),
	mode: 'create',
	source: 'preset',
	selectedVendorName: '',
	protocolVendorName: 'OpenAI',
	baseTag: '',
	baseURL: '',
	apiKey: '',
	contextLength: undefined,
	parameters: {},
	models: [],
	activeModelId: undefined,
	existingIndices: [],
});

const buildTagFromModel = (
	baseTag: string,
	modelName: string,
	vendorName: string
): string => {
	const normalizedBase = sanitizeTagFragment(vendorName || baseTag || 'provider');
	const normalizedModel = sanitizeTagFragment(modelName || 'model');
	return normalizedModel ? `${normalizedBase}-${normalizedModel}` : normalizedBase;
};

const ensureUniqueTag = (
	preferredTag: string,
	usedTags: Set<string>
): string => {
	const fallback = sanitizeTagFragment(preferredTag) || 'provider';
	if (!usedTags.has(fallback)) {
		usedTags.add(fallback);
		return fallback;
	}

	let suffix = 2;
	while (usedTags.has(`${fallback}-${suffix}`)) {
		suffix += 1;
	}
	const resolved = `${fallback}-${suffix}`;
	usedTags.add(resolved);
	return resolved;
};

export const buildProvidersFromDraft = (
	draft: ProviderGroupDraft,
	vendor: Vendor,
	existingProviders: ProviderSettings[],
	excludedIndices: number[]
): ProviderSettings[] => {
	const excluded = new Set(excludedIndices);
	const usedTags = new Set(
		existingProviders
			.filter((_, index) => !excluded.has(index))
			.map((provider) => provider.tag)
	);

	return draft.models.map((modelDraft) => {
		const resolvedApiKey = draft.source === 'custom' ? draft.apiKey : '';
		const nextOptions = {
			...cloneValue(vendor.defaultOptions),
			...cloneValue(modelDraft.options),
			apiKey: resolvedApiKey,
			baseURL: draft.baseURL,
			model: modelDraft.options.model,
			parameters: mergeProviderParametersWithMetadata(draft.parameters, {
				groupId: draft.groupId,
				baseTag: draft.baseTag,
				source: draft.source,
			}),
		} as BaseOptions;

		const preferredTag = modelDraft.tag || buildTagFromModel(draft.baseTag, nextOptions.model, vendor.name);
		const tag = ensureUniqueTag(preferredTag, usedTags);

		return {
			tag,
			vendor: vendor.name,
			options: nextOptions,
		};
	});
};

