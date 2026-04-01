import type { ResolvedToolRuntime } from 'src/tools/sub-agents/types';
import type {
	ExecutableToolSet,
	CandidateScope,
	DiscoveryCatalog,
	ProviderToolDiscoveryPayload,
	ProviderToolExecutablePayload,
} from './chat-tool-selection-types';
import type { ResolvedToolSurfaceSettings } from './chat-tool-feature-flags';
import {
	resolveProviderToolCapabilities,
	type ProviderToolCapabilities,
} from './provider-tool-capability-matrix';

export interface ProviderToolSurfaceAdapter {
	buildDiscoveryPayload(params: {
		catalog: DiscoveryCatalog;
		scope: CandidateScope;
	}): ProviderToolDiscoveryPayload;
	buildExecutablePayload(params: {
		scope: CandidateScope;
		toolRuntime: ResolvedToolRuntime;
	}): ProviderToolExecutablePayload;
	buildExecutableToolSet(params: {
		scope: CandidateScope;
		toolRuntime: ResolvedToolRuntime;
	}): ExecutableToolSet;
	getCapabilities(): ProviderToolCapabilities;
	supportsNativeDeferredLoading(): boolean;
}

abstract class BaseToolSurfaceAdapter implements ProviderToolSurfaceAdapter {
	constructor(private readonly capabilities: ProviderToolCapabilities) {}

	buildDiscoveryPayload(params: {
		catalog: DiscoveryCatalog;
		scope: CandidateScope;
	}): ProviderToolDiscoveryPayload {
		return {
			surfaceMode: this.capabilities.surfaceMode,
			capabilities: this.capabilities,
			catalog: params.catalog,
			scope: params.scope,
		};
	}

	buildExecutablePayload(params: {
		scope: CandidateScope;
		toolRuntime: ResolvedToolRuntime;
	}): ProviderToolExecutablePayload {
		return {
			surfaceMode: this.capabilities.surfaceMode,
			capabilities: this.capabilities,
			toolSet: this.buildExecutableToolSet(params),
		};
	}

	buildExecutableToolSet(params: {
		scope: CandidateScope;
		toolRuntime: ResolvedToolRuntime;
	}): ExecutableToolSet {
		return {
			tools: params.toolRuntime.requestTools,
			toolExecutor: params.toolRuntime.toolExecutor,
			getTools: params.toolRuntime.getTools,
			maxToolCallLoops: params.toolRuntime.maxToolCallLoops,
			scope: params.scope,
		};
	}

	getCapabilities(): ProviderToolCapabilities {
		return this.capabilities;
	}

	abstract supportsNativeDeferredLoading(): boolean;
}

class CurrentLoopToolSurfaceAdapter extends BaseToolSurfaceAdapter {
	constructor() {
		super(resolveProviderToolCapabilities({ nativeDeferredAdapter: false }));
	}

	supportsNativeDeferredLoading(): boolean {
		return false;
	}
}

class NativeDeferredToolSurfaceAdapter extends BaseToolSurfaceAdapter {
	constructor() {
		super(resolveProviderToolCapabilities({ nativeDeferredAdapter: true }));
	}

	supportsNativeDeferredLoading(): boolean {
		return true;
	}
}

export const createProviderToolSurfaceAdapter = (
	flags: ResolvedToolSurfaceSettings,
): ProviderToolSurfaceAdapter => {
	return flags.nativeDeferredAdapter
		? new NativeDeferredToolSurfaceAdapter()
		: new CurrentLoopToolSurfaceAdapter();
};
