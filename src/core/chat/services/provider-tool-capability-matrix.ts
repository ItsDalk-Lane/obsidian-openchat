import type { ResolvedToolSurfaceSettings } from './chat-tool-feature-flags';

export type ProviderToolSurfaceMode = 'current-loop' | 'native-deferred';

export interface ProviderToolCapabilities {
	readonly surfaceMode: ProviderToolSurfaceMode;
	readonly supportsDiscoveryPayload: boolean;
	readonly supportsExecutablePayload: boolean;
	readonly supportsNativeDeferredLoading: boolean;
	readonly usesCurrentLoopToolsApi: boolean;
	readonly supportsScopedGetTools: boolean;
}

export const CURRENT_LOOP_TOOL_CAPABILITIES: ProviderToolCapabilities = {
	surfaceMode: 'current-loop',
	supportsDiscoveryPayload: true,
	supportsExecutablePayload: true,
	supportsNativeDeferredLoading: false,
	usesCurrentLoopToolsApi: true,
	supportsScopedGetTools: true,
};

export const NATIVE_DEFERRED_TOOL_CAPABILITIES: ProviderToolCapabilities = {
	surfaceMode: 'native-deferred',
	supportsDiscoveryPayload: true,
	supportsExecutablePayload: true,
	supportsNativeDeferredLoading: true,
	usesCurrentLoopToolsApi: false,
	supportsScopedGetTools: false,
};

export const resolveProviderToolCapabilities = (
	flags: Pick<ResolvedToolSurfaceSettings, 'nativeDeferredAdapter'>,
): ProviderToolCapabilities => {
	return flags.nativeDeferredAdapter
		? NATIVE_DEFERRED_TOOL_CAPABILITIES
		: CURRENT_LOOP_TOOL_CAPABILITIES;
};