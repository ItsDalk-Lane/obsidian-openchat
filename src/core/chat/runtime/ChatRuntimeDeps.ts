import type { ToolExecutor } from 'src/types/tool';
import type { McpClientManager } from 'src/services/mcp';
import type { SkillScanResult } from 'src/services/skills';
import type { SkillScannerService } from 'src/services/skills';

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
