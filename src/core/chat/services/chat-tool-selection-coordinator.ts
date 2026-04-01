import { estimateToolDefinitionTokens } from 'src/core/chat/utils/token';
import type { ChatSettingsAccessor } from './chat-service-types';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { ResolvedToolRuntime } from 'src/tools/sub-agents/types';
import { DeterministicCandidateScopeResolver, buildToolSelectionQuery } from './chat-tool-candidate-resolver';
import { resolveToolSurfaceSettings } from './chat-tool-feature-flags';
import { createProviderToolSurfaceAdapter } from './chat-tool-surface-adapter';
import type {
	CandidateScope,
	PreparedToolTurn,
	ToolCallPolicySet,
	ToolSelectionCoordinator,
	ToolSelectionInput,
} from './chat-tool-selection-types';
import type { ChatToolRuntimeResolver } from './chat-tool-runtime-resolver';

interface ChatToolSelectionCoordinatorOptions {
	readonly toolRuntimeResolver: ChatToolRuntimeResolver;
	readonly settingsAccessor: ChatSettingsAccessor;
}

const buildPolicySet = (runtime: ResolvedToolRuntime): ToolCallPolicySet => {
	return {
		byToolName: Object.fromEntries(
			runtime.requestTools
				.map((tool) => [tool.name, tool.runtimePolicy])
				.filter((entry): entry is [string, NonNullable<typeof entry[1]>] => Boolean(entry[1])),
		),
	};
};

const buildFullScope = (query: string, runtime: ResolvedToolRuntime): CandidateScope => {
	return {
		mode: 'atomic-tools',
		candidateToolNames: runtime.requestTools.map((tool) => tool.name),
		candidateServerIds: Array.from(new Set(
			runtime.requestTools
				.filter((tool) => tool.source === 'mcp')
				.map((tool) => tool.sourceId),
		)),
		reasons: ['full-runtime-fallback'],
		query,
	};
};

const getLatestUserMessage = (input: ToolSelectionInput): string | undefined => {
	const messages = [...input.session.messages].reverse();
	return messages.find((message) => message.role === 'user' && !message.metadata?.hiddenFromModel)?.content;
};

export class ChatToolSelectionCoordinator implements ToolSelectionCoordinator {
	private readonly candidateScopeResolver = new DeterministicCandidateScopeResolver();

	constructor(private readonly options: ChatToolSelectionCoordinatorOptions) {}

	async prepareTurn(input: ToolSelectionInput): Promise<PreparedToolTurn> {
		const toolSurfaceFlags = resolveToolSurfaceSettings(
			this.options.settingsAccessor.getAiRuntimeSettings(),
		);
		const adapter = createProviderToolSurfaceAdapter(toolSurfaceFlags);
		const discoveryCatalog = toolSurfaceFlags.toolDiscoveryCatalogV2
			? await this.options.toolRuntimeResolver.buildDiscoveryCatalog({
				includeSubAgents: input.includeSubAgents,
				session: input.session,
			})
			: { version: 1, entries: [], workflowEntries: [], serverEntries: [] };
		const query = buildToolSelectionQuery([
			input.taskDescription,
			input.context,
			getLatestUserMessage(input),
		]);

		if (!toolSurfaceFlags.twoStageToolSelection) {
			const runtime = await this.options.toolRuntimeResolver.resolveToolRuntime({
				includeSubAgents: input.includeSubAgents,
				parentSessionId: input.parentSessionId,
				subAgentStateCallback: input.subAgentStateCallback,
				session: input.session,
			});
			const candidateScope = buildFullScope(query, runtime);
			const providerDiscoveryPayload = adapter.buildDiscoveryPayload({
				catalog: discoveryCatalog,
				scope: candidateScope,
			});
			const providerExecutablePayload = adapter.buildExecutablePayload({
				scope: candidateScope,
				toolRuntime: runtime,
			});
			const executableToolSet = providerExecutablePayload.toolSet;
			return {
				candidateScope,
				executableToolSet,
				toolPolicies: buildPolicySet(runtime),
				mode: candidateScope.mode,
				discoveryCatalog,
				providerDiscoveryPayload,
				providerExecutablePayload,
			};
		}

		const candidateScope = this.candidateScopeResolver.resolve({
			query,
			catalog: discoveryCatalog,
			workflowToolsDefaultHidden: toolSurfaceFlags.workflowToolsDefaultHidden,
			workflowModeV1: toolSurfaceFlags.workflowModeV1,
		});

		const runtime = candidateScope.mode === 'no-tool'
			? { requestTools: [] }
			: await this.options.toolRuntimeResolver.resolveToolRuntime({
				includeSubAgents: candidateScope.mode === 'workflow' ? true : input.includeSubAgents,
				explicitToolNames: candidateScope.candidateToolNames,
				explicitMcpServerIds: candidateScope.candidateServerIds,
				parentSessionId: input.parentSessionId,
				subAgentStateCallback: input.subAgentStateCallback,
				session: input.session,
			});
		const providerDiscoveryPayload = adapter.buildDiscoveryPayload({
			catalog: discoveryCatalog,
			scope: candidateScope,
		});
		const providerExecutablePayload = adapter.buildExecutablePayload({
			scope: candidateScope,
			toolRuntime: runtime,
		});
		const executableToolSet = providerExecutablePayload.toolSet;

		DebugLogger.debug('[ToolSelection] 已准备候选工具集', {
			query,
			mode: candidateScope.mode,
			candidateToolNames: candidateScope.candidateToolNames,
			candidateServerIds: candidateScope.candidateServerIds,
			requestToolNames: executableToolSet.tools.map((tool) => tool.name),
			toolTokenEstimate: estimateToolDefinitionTokens(executableToolSet.tools),
		});

		return {
			candidateScope,
			executableToolSet,
			toolPolicies: buildPolicySet(runtime),
			mode: candidateScope.mode,
			discoveryCatalog,
			providerDiscoveryPayload,
			providerExecutablePayload,
		};
	}
}
