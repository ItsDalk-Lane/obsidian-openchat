import type {
	GetToolsFn,
	ToolDefinition,
	ToolRuntimePolicy,
	ToolExecutor,
} from 'src/types/tool';
import type { ChatSession } from '../types/chat';
import type { SubAgentStateCallback } from 'src/tools/sub-agents/types';
import type {
	ProviderToolCapabilities,
	ProviderToolSurfaceMode,
} from './provider-tool-capability-matrix';

export interface DiscoveryEntry {
	readonly stableId: string;
	readonly toolName: string;
	readonly familyId: string;
	readonly displayName: string;
	readonly oneLinePurpose: string;
	readonly visibility: NonNullable<ToolDefinition['discovery']>['discoveryVisibility'];
	readonly capabilityTags: readonly string[];
	readonly source: string;
	readonly sourceId: string;
	readonly riskLevel: NonNullable<ToolDefinition['discovery']>['riskLevel'];
	readonly argumentComplexity: NonNullable<ToolDefinition['discovery']>['argumentComplexity'];
	readonly requiredArgsSummary: readonly string[];
	readonly whenToUse: readonly string[];
	readonly whenNotToUse: readonly string[];
}

export interface DiscoveryServerEntry {
	readonly serverId: string;
	readonly displayName: string;
	readonly oneLinePurpose: string;
	readonly capabilityTags: readonly string[];
}

export interface DiscoveryCatalog {
	readonly version: number;
	readonly entries: DiscoveryEntry[];
	readonly workflowEntries: DiscoveryEntry[];
	readonly serverEntries: DiscoveryServerEntry[];
}

export interface CandidateScope {
	readonly mode: 'no-tool' | 'atomic-tools' | 'workflow';
	readonly candidateToolNames: string[];
	readonly candidateServerIds: string[];
	readonly reasons: string[];
	readonly query: string;
}

export interface ExecutableToolSet {
	readonly tools: ToolDefinition[];
	readonly toolExecutor?: ToolExecutor;
	readonly getTools?: GetToolsFn;
	readonly maxToolCallLoops?: number;
	readonly scope: CandidateScope;
}

export interface ProviderToolDiscoveryPayload {
	readonly surfaceMode: ProviderToolSurfaceMode;
	readonly capabilities: ProviderToolCapabilities;
	readonly catalog: DiscoveryCatalog;
	readonly scope: CandidateScope;
}

export interface ProviderToolExecutablePayload {
	readonly surfaceMode: ProviderToolSurfaceMode;
	readonly capabilities: ProviderToolCapabilities;
	readonly toolSet: ExecutableToolSet;
}

export interface ToolCallPolicySet {
	readonly byToolName: Record<string, ToolRuntimePolicy>;
}

export interface PreparedToolTurn {
	readonly candidateScope: CandidateScope;
	readonly executableToolSet: ExecutableToolSet;
	readonly toolPolicies: ToolCallPolicySet;
	readonly mode: CandidateScope['mode'];
	readonly discoveryCatalog: DiscoveryCatalog;
	readonly providerDiscoveryPayload: ProviderToolDiscoveryPayload;
	readonly providerExecutablePayload: ProviderToolExecutablePayload;
}

export interface ToolSelectionInput {
	readonly includeSubAgents?: boolean;
	readonly parentSessionId?: string;
	readonly subAgentStateCallback?: SubAgentStateCallback;
	readonly session: ChatSession;
	readonly context?: string;
	readonly taskDescription?: string;
}

export interface DiscoveryCatalogBuildOptions {
	readonly includeSubAgents?: boolean;
	readonly session?: ChatSession;
}

export interface CandidateResolutionInput {
	readonly query: string;
	readonly catalog: DiscoveryCatalog;
	readonly workflowToolsDefaultHidden: boolean;
	readonly workflowModeV1: boolean;
}

export interface ToolSelectionCoordinator {
	prepareTurn(input: ToolSelectionInput): Promise<PreparedToolTurn>;
}
