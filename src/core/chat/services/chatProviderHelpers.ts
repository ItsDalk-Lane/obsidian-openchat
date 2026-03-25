import { requestUrl } from 'obsidian';
import { isImageGenerationModel } from 'src/LLMProviders/openRouter';
import { availableVendors } from 'src/settings/ai-runtime';
import type { ProviderSettings } from 'src/types/provider';

export interface OllamaCapabilityCacheEntry {
	reasoning: boolean;
	checkedAt: number;
	warned?: boolean;
}

export const getDefaultProviderTag = (
	providers: ProviderSettings[]
): string | null => providers[0]?.tag ?? null;

export const resolveProviderByTag = (
	providers: ProviderSettings[],
	tag?: string
): ProviderSettings | null => {
	if (!providers.length) {
		return null;
	}
	if (!tag) {
		return providers[0];
	}
	return providers.find((provider) => provider.tag === tag) ?? providers[0];
};

export const findProviderByTagExact = (
	providers: ProviderSettings[],
	tag?: string
): ProviderSettings | null => {
	if (!tag) {
		return null;
	}
	return providers.find((provider) => provider.tag === tag) ?? null;
};

export const resolveProvider = (
	providers: ProviderSettings[],
	selectedModelId?: string | null
): ProviderSettings | null => {
	return resolveProviderByTag(providers, selectedModelId ?? undefined);
};

export const getModelDisplayName = (provider: ProviderSettings): string =>
	provider.options.model || provider.tag;

export const providerSupportsImageGeneration = (
	provider: ProviderSettings
): boolean => {
	const vendor = availableVendors.find((item) => item.name === provider.vendor);
	if (!vendor || !vendor.capabilities.includes('Image Generation')) {
		return false;
	}
	if (provider.vendor === 'OpenRouter') {
		return isImageGenerationModel(provider.options.model);
	}
	return true;
};

export const isCurrentModelSupportImageGeneration = (params: {
	providers: ProviderSettings[];
	selectedModelId?: string | null;
}): boolean => {
	const provider = resolveProvider(params.providers, params.selectedModelId);
	if (!provider) {
		return false;
	}
	return providerSupportsImageGeneration(provider);
};

export const normalizeOllamaBaseUrl = (baseURL?: string): string => {
	const trimmed = (baseURL || '').trim();
	if (!trimmed) {
		return 'http://127.0.0.1:11434';
	}
	return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
};

export const getOllamaCapabilities = async (params: {
	cache: Map<string, OllamaCapabilityCacheEntry>;
	baseURL: string;
	model: string;
}): Promise<OllamaCapabilityCacheEntry> => {
	const normalizedBase = normalizeOllamaBaseUrl(params.baseURL);
	const key = `${normalizedBase}|${params.model}`;
	const cached = params.cache.get(key);
	const now = Date.now();
	if (cached && now - cached.checkedAt < 5 * 60 * 1000) {
		return cached;
	}

	try {
		const response = await requestUrl({
			url: `${normalizedBase}/api/show`,
			method: 'POST',
			body: JSON.stringify({ model: params.model }),
		});
		const capabilities = Array.isArray(response.json?.capabilities)
			? response.json.capabilities
			: [];
		const normalized = capabilities.map((cap: string) =>
			String(cap).toLowerCase()
		);
		const next = {
			reasoning:
				normalized.includes('thinking')
				|| normalized.includes('reasoning'),
			checkedAt: now,
		};
		params.cache.set(key, next);
		return next;
	} catch {
		const next = {
			reasoning: false,
			checkedAt: now,
			warned: cached?.warned,
		};
		params.cache.set(key, next);
		return next;
	}
};

export const getOllamaCapabilitiesForModel = async (params: {
	cache: Map<string, OllamaCapabilityCacheEntry>;
	providers: ProviderSettings[];
	modelTag: string;
	enableReasoningToggle: boolean;
}): Promise<{
	supported: boolean;
	shouldWarn: boolean;
	modelName: string;
} | null> => {
	const provider = findProviderByTagExact(params.providers, params.modelTag);
	if (
		!provider
		|| provider.vendor !== 'Ollama'
		|| !params.enableReasoningToggle
	) {
		return null;
	}

	const modelName = String(
		provider.options.model ?? provider.tag ?? params.modelTag
	);
	const baseURL = String(provider.options.baseURL ?? '');
	if (!modelName) {
		return null;
	}

	const caps = await getOllamaCapabilities({
		cache: params.cache,
		baseURL,
		model: modelName,
	});
	const key = `${normalizeOllamaBaseUrl(baseURL)}|${modelName}`;
	const cached = params.cache.get(key);
	const shouldWarn = !caps.reasoning && Boolean(cached) && !cached?.warned;
	if (shouldWarn && cached) {
		params.cache.set(key, { ...cached, warned: true });
	}

	return {
		supported: caps.reasoning,
		shouldWarn,
		modelName,
	};
};

export const rethrowImageGenerationError = (error: unknown): never => {
	if (error instanceof Error) {
		const errorMessage = error.message.toLowerCase();
		if (
			errorMessage.includes('not support')
			|| errorMessage.includes('modalities')
			|| errorMessage.includes('output_modalities')
		) {
			throw new Error(`当前模型不支持图像生成功能。

解决方法：
1. 选择支持图像生成的模型，如 google/gemini-2.5-flash-image-preview
2. 在模型设置中确认已启用图像生成功能
3. 检查API密钥是否有图像生成权限`);
		}
		if (
			errorMessage.includes('content policy')
			|| errorMessage.includes('safety')
			|| errorMessage.includes('inappropriate')
		) {
			throw new Error(`图像生成请求被内容策略阻止。

解决方法：
1. 修改您的描述，避免敏感内容
2. 使用更中性、通用的描述
3. 尝试不同的描述角度`);
		}
		if (
			errorMessage.includes('quota')
			|| errorMessage.includes('balance')
			|| errorMessage.includes('insufficient')
		) {
			throw new Error(`账户配额或余额不足。

解决方法：
1. 检查API账户余额
2. 升级到更高的配额计划
3. 等待配额重置（如果是按天计算）`);
		}
		if (errorMessage.includes('保存图片附件失败')) {
			throw new Error(`图片生成成功，但保存到本地失败。

解决方法：
1. 检查Obsidian附件文件夹权限
2. 确保有足够的磁盘空间
3. 尝试在设置中更改图片保存位置`);
		}
		throw error;
	}
	throw new Error(`图像生成过程中发生未知错误: ${String(error)}`);
};
