import type { McpRuntimeManager } from 'src/domains/mcp/types';
import type { BuiltinToolsRuntime } from 'src/tools/runtime/BuiltinToolsRuntime';
import type {
	ResolvedToolRuntime,
	SubAgentChatServiceAdapter,
	SubAgentStateCallback,
} from 'src/tools/sub-agents/types';
import type { SubAgentScannerService } from 'src/tools/sub-agents/SubAgentScannerService';
import type { ChatRuntimeDeps } from '../runtime/chat-runtime-deps';
import type { ChatSession } from '../types/chat';
import type { ChatPlanSyncService } from './chat-plan-sync-service';
import type { ChatHostDeps, ChatSettingsAccessor } from './chat-service-types';

export interface ResolveToolRuntimeOptions {
	includeSubAgents?: boolean;
	explicitToolNames?: string[];
	explicitMcpServerIds?: string[];
	parentSessionId?: string;
	subAgentStateCallback?: SubAgentStateCallback;
	session?: ChatSession;
}

export interface ChatToolRuntimeResolverOptions {
	createBuiltinToolsRuntime: ChatHostDeps['createBuiltinToolsRuntime'];
	settingsAccessor: ChatSettingsAccessor;
	runtimeDeps: ChatRuntimeDeps;
	subAgentScannerService: SubAgentScannerService;
	planSyncService: ChatPlanSyncService;
	getActiveSession: () => ChatSession | null;
	getMaxToolCallLoops: () => number | undefined;
	showMcpNoticeOnce: (message: string) => void;
	chatServiceAdapter: SubAgentChatServiceAdapter;
}

export type BuiltinToolList = Awaited<ReturnType<BuiltinToolsRuntime['listTools']>>;
export type McpCallTool =
	| ((serverId: string, name: string, args: Record<string, unknown>) => Promise<string>)
	| null;
export type RuntimeResolutionResult = Promise<ResolvedToolRuntime>;
export type RuntimeManagerLike = McpRuntimeManager | null | undefined;
