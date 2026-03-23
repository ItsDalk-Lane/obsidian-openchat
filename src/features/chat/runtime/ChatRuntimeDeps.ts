import type { ToolExecutor } from '../../tars/agent-loop/types';
import type { McpClientManager } from '../../tars/mcp';
import type { SkillScanResult } from '../../skills';
import type { SkillScannerService } from '../../skills';

export interface ChatRuntimeDeps {
	ensureSkillsInitialized(): Promise<void>;
	getSkillScannerService(): SkillScannerService | null;
	getInstalledSkillsSnapshot(): SkillScanResult | null;
	scanSkills(): Promise<SkillScanResult>;
	refreshSkills(): Promise<SkillScanResult>;
	onSkillsChange(listener: (result: SkillScanResult) => void): () => void;
	ensureMcpInitialized(): Promise<void>;
	getMcpClientManager(): McpClientManager | null;
	getCustomToolExecutors(): ToolExecutor[];
}