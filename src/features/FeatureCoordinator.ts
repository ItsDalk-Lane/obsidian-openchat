import type OpenChatPlugin from 'src/main';
import type { PluginSettings } from 'src/settings/PluginSettings';
import {
	TarsFeatureManager,
} from './tars';
import { ChatFeatureManager } from './chat';
import type { ChatRuntimeDeps } from './chat/runtime/ChatRuntimeDeps';
import type { McpClientManager } from './tars/mcp';
import type { ToolExecutor } from './tars/agent-loop/types';
import {
    SkillsRuntimeCoordinator,
    SkillScannerService,
    SkillWatcherService,
	type SkillScanResult,
} from './skills';
import { ToolExecutorRegistry } from './runtime/ToolExecutorRegistry';
import { McpRuntimeCoordinator } from './tars/mcp/McpRuntimeCoordinator';

export class FeatureCoordinator {
    private tarsFeatureManager: TarsFeatureManager | null = null;
    private chatFeatureManager: ChatFeatureManager | null = null;
    private readonly skillsRuntime: SkillsRuntimeCoordinator;
    private readonly toolExecutorRegistry = new ToolExecutorRegistry();
    private readonly mcpRuntime: McpRuntimeCoordinator;
    private readonly chatRuntimeDeps: ChatRuntimeDeps;

    constructor(private plugin: OpenChatPlugin) {
        this.skillsRuntime = new SkillsRuntimeCoordinator(this.plugin.app, {
            getAiDataFolder: () => this.plugin.settings.aiDataFolder,
        });
        this.mcpRuntime = new McpRuntimeCoordinator(this.plugin.app);
        this.chatRuntimeDeps = this.createChatRuntimeDeps();
    }

    initializeTars(settings: PluginSettings) {
        const tarsSettings = settings.tars.settings;
        if (!this.tarsFeatureManager) {
            this.tarsFeatureManager = new TarsFeatureManager(this.plugin, tarsSettings);
            this.tarsFeatureManager.initialize();
        } else {
            this.tarsFeatureManager.updateSettings(tarsSettings);
        }
        this.chatFeatureManager?.updateProviderSettings(tarsSettings);
    }

    async initializeChat(settings: PluginSettings) {
        await this.initializeSkills();
        if (!this.chatFeatureManager) {
            this.chatFeatureManager = new ChatFeatureManager(this.plugin, this.chatRuntimeDeps);
            await this.chatFeatureManager.initialize(settings.chat);
        } else {
            this.chatFeatureManager.updateChatSettings(settings.chat);
        }
        this.chatFeatureManager?.updateProviderSettings(settings.tars.settings);
    }

    async initializeMcp(settings: PluginSettings) {
        await this.mcpRuntime.initialize(settings);
    }

    async initializeSkills(): Promise<void> {
        await this.skillsRuntime.initialize();
    }

    async refresh(settings: PluginSettings) {
        this.initializeTars(settings);
        await this.initializeMcp(settings);
        if (this.chatFeatureManager) {
            await this.initializeChat(settings);
        }
    }

    getChatFeatureManager() {
        return this.chatFeatureManager;
    }

    getMcpClientManager(): McpClientManager | null {
        return this.mcpRuntime.getManager();
    }

    registerToolExecutor(executor: ToolExecutor): () => void {
        return this.toolExecutorRegistry.register(executor);
    }

    getCustomToolExecutors(): ToolExecutor[] {
        return this.toolExecutorRegistry.getAll();
    }

    getInstalledSkillsSnapshot(): SkillScanResult | null {
        return this.skillsRuntime.getInstalledSkillsSnapshot();
    }

    getSkillScannerService(): SkillScannerService | null {
        return this.skillsRuntime.getSkillScannerService();
    }

    getSkillWatcherService(): SkillWatcherService | null {
        return this.skillsRuntime.getSkillWatcherService();
    }

    async scanSkills(): Promise<SkillScanResult> {
        return await this.skillsRuntime.scanSkills();
    }

    async refreshSkills(): Promise<SkillScanResult> {
        return await this.skillsRuntime.refreshSkills();
    }

    onSkillsChange(listener: (result: SkillScanResult) => void): () => void {
        return this.skillsRuntime.onSkillsChange(listener);
    }

    async refreshQuickActionsCache(): Promise<void> {
        if (this.chatFeatureManager) {
            await this.chatFeatureManager.refreshQuickActionsCache();
        }
    }

    dispose() {
        this.skillsRuntime.dispose();
        this.toolExecutorRegistry.clear();
        this.mcpRuntime.dispose();
        this.tarsFeatureManager?.dispose();
        this.tarsFeatureManager = null;
        this.chatFeatureManager?.dispose();
        this.chatFeatureManager = null;
    }

    private createChatRuntimeDeps(): ChatRuntimeDeps {
        return {
            ensureSkillsInitialized: async () => {
                await this.initializeSkills();
            },
            getSkillScannerService: () => this.getSkillScannerService(),
            getInstalledSkillsSnapshot: () => this.getInstalledSkillsSnapshot(),
            scanSkills: async () => await this.scanSkills(),
            refreshSkills: async () => await this.refreshSkills(),
            onSkillsChange: (listener) => this.onSkillsChange(listener),
            ensureMcpInitialized: async () => {
                await this.initializeMcp(this.plugin.settings);
            },
            getMcpClientManager: () => this.getMcpClientManager(),
            getCustomToolExecutors: () => this.getCustomToolExecutors(),
        };
    }
}
