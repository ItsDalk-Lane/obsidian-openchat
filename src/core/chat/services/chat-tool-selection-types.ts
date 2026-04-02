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

export type ToolRoutingAction =
	| 'locate'
	| 'search-content'
	| 'read'
	| 'write'
	| 'metadata'
	| 'workspace'
	| 'web-fetch'
	| 'web-search'
	| 'time'
	| 'workflow'
	| 'unknown';

export type ToolRoutingTargetKind =
	| 'file'
	| 'directory'
	| 'selection'
	| 'vault'
	| 'workspace'
	| 'url'
	| 'skill'
	| 'sub-agent'
	| 'unknown';

export type ToolRoutingTargetExplicitness = 'explicit' | 'contextual' | 'unknown';
export type ToolRoutingScope = 'single' | 'multi' | 'vault' | 'workspace' | 'external' | 'unknown';
export type ToolRoutingWriteIntent = 'none' | 'safe' | 'destructive';
export type ToolRoutingConfidence = 'high' | 'medium' | 'low';
export type ToolRoutingSelectionKind = 'none' | 'text' | 'file' | 'folder' | 'mixed';
export type ToolRoutingWorkflowStage =
	| 'initial'
	| 'post-discovery'
	| 'post-read'
	| 'post-write'
	| 'post-workflow';

export type ToolRoutingQueryIndexDataSource = 'file' | 'property' | 'tag' | 'task';

export interface ToolRoutingSelectionRange {
	readonly from: number;
	readonly to: number;
}

export interface ToolRoutingRecentDiscovery {
	readonly toolName: string;
	readonly hasResults: boolean;
	readonly resultCount?: number;
	readonly targetKind: ToolRoutingTargetKind;
	readonly dataSource?: ToolRoutingQueryIndexDataSource;
	readonly queryText?: string;
	readonly resultFields?: readonly string[];
	readonly resultReferencePaths?: readonly string[];
	readonly resultReferenceUrls?: readonly string[];
}

export interface ToolRoutingRuntimeContext {
	readonly activeFilePath?: string | null;
}

export interface ToolRoutingEnvironmentContext {
	readonly hasSelectedText: boolean;
	readonly hasSelectedFiles: boolean;
	readonly hasSelectedFolders: boolean;
	readonly hasContextualTarget: boolean;
	readonly hasActiveFile: boolean;
	readonly activeFilePath?: string;
	readonly selectedTextFilePath?: string;
	readonly selectedTextRange?: ToolRoutingSelectionRange;
	readonly selectionKind: ToolRoutingSelectionKind;
	readonly recentDiscovery?: ToolRoutingRecentDiscovery;
	readonly latestToolNames: string[];
	readonly workflowStage: ToolRoutingWorkflowStage;
}

export interface TaskSignature {
	readonly normalizedQuery: string;
	readonly nextAction: ToolRoutingAction;
	readonly targetKind: ToolRoutingTargetKind;
	readonly targetExplicitness: ToolRoutingTargetExplicitness;
	readonly scope: ToolRoutingScope;
	readonly writeIntent: ToolRoutingWriteIntent;
	readonly confidence: ToolRoutingConfidence;
	readonly explicitToolName?: string;
	readonly environment: ToolRoutingEnvironmentContext;
	readonly reasons: string[];
}

export interface ToolScoreBreakdown {
	readonly domainMatch: number;
	readonly targetFit: number;
	readonly contextFit: number;
	readonly workflowPrior: number;
	readonly literalRecall: number;
	readonly riskAdjustment: number;
	readonly total: number;
}

export interface ToolScoreCard {
	readonly toolName: string;
	readonly familyId: string;
	readonly sourceId: string;
	readonly domainId: string;
	readonly score: number;
	readonly breakdown: ToolScoreBreakdown;
	readonly blockedReasons: string[];
}

export interface CapabilityDomainScore {
	readonly domainId: string;
	readonly score: number;
	readonly toolNames: string[];
	readonly reasons: string[];
}

export interface ToolRoutingTrace {
	readonly taskSignature: TaskSignature;
	readonly selectedDomains: CapabilityDomainScore[];
	readonly scoreCards: ToolScoreCard[];
}

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
	readonly selectedDomainIds?: string[];
	readonly fallbackMode?: 'none' | 'conservative' | 'no-tool';
	readonly routingTrace?: ToolRoutingTrace;
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
	readonly session: ChatSession;
	readonly catalog: DiscoveryCatalog;
	readonly workflowToolsDefaultHidden: boolean;
	readonly workflowModeV1: boolean;
	readonly routingContext?: ToolRoutingRuntimeContext;
}

export interface ToolSelectionCoordinator {
	prepareTurn(input: ToolSelectionInput): Promise<PreparedToolTurn>;
}
