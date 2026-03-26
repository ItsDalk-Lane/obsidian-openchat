import type OpenChatPlugin from 'src/main';
import type { PluginSettings } from 'src/settings/PluginSettings';
import { AiRuntimeCommandManager } from 'src/commands/ai-runtime';
import { ChatFeatureManager } from 'src/core/chat';
import type { ChatRuntimeDeps } from 'src/core/chat/runtime/ChatRuntimeDeps';
import type { McpClientManager } from 'src/services/mcp';
import type { ToolExecutor } from 'src/types/tool';
import { ChatService } from 'src/core/chat/services/ChatService';
import { ChatViewCoordinator } from 'src/commands/chat';
import {
	SkillsRuntimeCoordinator,
	SkillScannerService,
	SkillWatcherService,
	type SkillScanResult,
} from 'src/services/skills';
import { ToolExecutorRegistry } from 'src/tools/runtime/ToolExecutorRegistry';
import { McpRuntimeCoordinator } from 'src/services/mcp/McpRuntimeCoordinator';

export class FeatureCoordinator {
    private aiRuntimeCommandManager: AiRuntimeCommandManager | null = null;
    private chatFeatureManager: ChatFeatureManager | null = null;
    private earlyChatService: ChatService | null = null;
    private earlyChatViewCoordinator: ChatViewCoordinator | null = null;
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

    initializeAiRuntime(settings: PluginSettings) {
        const aiRuntimeSettings = settings.aiRuntime;
        if (!this.aiRuntimeCommandManager) {
            this.aiRuntimeCommandManager = new AiRuntimeCommandManager(this.plugin, aiRuntimeSettings);
            this.aiRuntimeCommandManager.initialize();
        } else {
            this.aiRuntimeCommandManager.updateSettings(aiRuntimeSettings);
        }
        this.chatFeatureManager?.updateProviderSettings(aiRuntimeSettings);
    }

    /**
     * 在 onLayoutReady 之前同步注册聊天视图类型。
     * 确保 Obsidian 恢复工作区时能立即识别视图类型，消除标题栏占位图标。
     * 必须在 onload() 中任何 await 之前调用。
     */
    registerChatViewTypesEarly(): void {
        if (this.earlyChatService) return;
        this.earlyChatService = new ChatService(this.plugin, this.chatRuntimeDeps);
        this.earlyChatViewCoordinator = new ChatViewCoordinator(this.plugin, this.earlyChatService);
        this.earlyChatViewCoordinator.registerViewTypesOnly();
        // 提前初始化 Service（使用默认设置），确保 Obsidian 恢复视图时 activeSession 不为 null，
        // 避免在真实设置加载完成前显示「暂无聊天会话」的空白状态。
        // initialize() 具有幂等保护，后续 initializeChat() 中的再次调用只会更新设置并重新发射状态。
        this.earlyChatService.initialize();
    }

    async initializeChat(settings: PluginSettings) {
        await this.initializeSkills();
        if (!this.chatFeatureManager) {
            this.chatFeatureManager = new ChatFeatureManager(
                this.plugin,
                this.chatRuntimeDeps,
                this.earlyChatService ?? undefined,
                this.earlyChatViewCoordinator ?? undefined,
            );
            // ChatFeatureManager 已接管这两个实例的所有权，清除早期引用避免重复 dispose
            this.earlyChatService = null;
            this.earlyChatViewCoordinator = null;
            await this.chatFeatureManager.initialize(settings.chat);
        } else {
            this.chatFeatureManager.updateChatSettings(settings.chat);
        }
        this.chatFeatureManager?.updateProviderSettings(settings.aiRuntime);
    }

    async initializeMcp(settings: PluginSettings) {
        await this.mcpRuntime.initialize(settings);
    }

    async initializeSkills(): Promise<void> {
        await this.skillsRuntime.initialize();
    }

    async refresh(settings: PluginSettings) {
        this.initializeAiRuntime(settings);
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
        this.aiRuntimeCommandManager?.dispose();
        this.aiRuntimeCommandManager = null;
        this.chatFeatureManager?.dispose();
        this.chatFeatureManager = null;
        // 若 initializeChat 从未执行成功，需清理提前创建的实例
        this.earlyChatViewCoordinator?.dispose();
        this.earlyChatViewCoordinator = null;
        this.earlyChatService?.dispose();
        this.earlyChatService = null;
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
