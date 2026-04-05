import type {
	SubAgentChatServiceAdapter,
	SubAgentStateCallback,
} from 'src/tools/sub-agents/types';
import type { SubAgentScannerService } from 'src/tools/sub-agents/SubAgentScannerService';
import type { ChatRuntimeDeps } from '../runtime/chat-runtime-deps';
import type { ChatSession } from '../types/chat';
import type { ChatPlanSyncService } from './chat-plan-sync-service';
import type { ChatHostDeps, ChatSettingsAccessor } from './chat-service-types';
import type { SkillExecutionRequest } from 'src/domains/skills/execution';
import type { SkillReturnPacket } from 'src/domains/skills/session-state';

export interface ResolveToolRuntimeOptions {
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
	executeSkillExecution: (
		request: SkillExecutionRequest,
	) => Promise<SkillReturnPacket>;
}
