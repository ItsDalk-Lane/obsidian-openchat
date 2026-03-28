import type { ToolExecutor } from 'src/types/tool';
import type { McpRuntimeManager } from 'src/domains/mcp/types';
import type { SkillScanResult } from 'src/domains/skills/types';
import type { SkillScannerService } from 'src/domains/skills/service';

export interface ChatRuntimeDeps {
	ensureSkillsInitialized(): Promise<void>;
	getSkillScannerService(): SkillScannerService | null;
	getInstalledSkillsSnapshot(): SkillScanResult | null;
	scanSkills(): Promise<SkillScanResult>;
	refreshSkills(): Promise<SkillScanResult>;
	onSkillsChange(listener: (result: SkillScanResult) => void): () => void;
	ensureMcpInitialized(): Promise<void>;
	getMcpClientManager(): McpRuntimeManager | null;
	getCustomToolExecutors(): ToolExecutor[];
}
