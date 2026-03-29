/**
 * @module core/FeatureCoordinator
 * @description 薄编排入口。
 *   职责仅限于：创建共享基础设施（obsidianApiProvider、systemPromptAssembler），
 *   持有子装配器与 runtime 协调器引用，编排 initialize / refresh / dispose 顺序。
 *   具体的功能装配、宿主适配、查询门面已分别委托给：
 *   - ChatAssembler（chat 功能装配 + 早期视图恢复）
 *   - AiRuntimeAssembler（ai-runtime 命令层装配）
 *   - FeatureQueryFacade（对外查询门面 + tool registry）
 *
 * @dependencies src/core/chat-assembler, src/core/ai-runtime-assembler,
 *   src/core/feature-query-facade, src/domains/skills/ui, src/domains/mcp/ui,
 *   src/providers/obsidian-api, src/core/services/SystemPromptAssembler
 * @side-effects 通过子装配器间接注册视图、命令、状态栏等
 * @invariants 不直接构建 host adapter，不直接持有 ChatFeatureManager 等运行时对象。
 */

import type { App, Command, WorkspaceLeaf } from 'obsidian';
import type { Extension } from '@codemirror/state';
import type { PluginSettings } from 'src/domains/settings/types';
import type { McpRuntimeManager } from 'src/domains/mcp/types';
import type { ToolExecutor } from 'src/types/tool';
import type { SkillScanResult } from 'src/domains/skills/types';
import type { SkillScannerService } from 'src/domains/skills/service';
import type { ChatRuntimeDeps } from 'src/core/chat/runtime/chat-runtime-deps';
import {
    McpRuntimeCoordinator,
    createMcpRuntimeManagerFactory,
} from 'src/domains/mcp/ui';
import { createObsidianApiProvider } from 'src/providers/obsidian-api';
import { SystemPromptAssembler } from 'src/core/services/SystemPromptAssembler';
import { DebugLogger } from 'src/utils/DebugLogger';
import { SkillsRuntimeCoordinator } from 'src/domains/skills/ui';
import { ChatAssembler } from './chat-assembler';
import { AiRuntimeAssembler } from './ai-runtime-assembler';
import { FeatureQueryFacade } from './feature-query-facade';

/**
 * FeatureCoordinator 对宿主 Plugin 的最小依赖接口。
 * OpenChatPlugin 天然满足此接口，由 main.ts 构造时传入 this。
 */
interface FeatureCoordinatorDeps {
    readonly app: App;
    settings: PluginSettings;
    readonly manifest: { readonly id: string };
    saveSettings(): Promise<void>;
    registerView(type: string, viewCreator: (leaf: WorkspaceLeaf) => unknown): void;
    addCommand(command: Command): void;
    addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => unknown): HTMLElement;
    addStatusBarItem(): HTMLElement;
    removeCommand(id: string): void;
    registerEditorExtension(extension: Extension | readonly Extension[]): void;
}

export class FeatureCoordinator {
    // ── 共享基础设施 ──────────────────────────────────
    private readonly systemPromptAssembler: SystemPromptAssembler;
    private readonly obsidianApiProvider;

    // ── 域 runtime 协调器 ─────────────────────────────
    private readonly skillsRuntime: SkillsRuntimeCoordinator;
    private readonly mcpRuntime: McpRuntimeCoordinator;

    // ── 子装配器 ──────────────────────────────────────
    private readonly chatAssembler: ChatAssembler;
    private readonly aiRuntimeAssembler: AiRuntimeAssembler;

    // ── 查询门面 ──────────────────────────────────────
    private readonly queryFacade: FeatureQueryFacade;

    constructor(private plugin: FeatureCoordinatorDeps) {
        this.systemPromptAssembler = new SystemPromptAssembler(this.plugin.app);
        this.obsidianApiProvider = createObsidianApiProvider(
            this.plugin.app,
            async (featureId) => await this.systemPromptAssembler.buildGlobalSystemPrompt(featureId as never),
        );

        this.skillsRuntime = new SkillsRuntimeCoordinator(this.obsidianApiProvider, {
            getAiDataFolder: () => this.plugin.settings.aiDataFolder,
            logger: {
                warn(message: string, metadata?: unknown): void {
                    DebugLogger.warn(message, metadata);
                },
            },
        });

        this.mcpRuntime = new McpRuntimeCoordinator(
            createMcpRuntimeManagerFactory({
                notify: (message, timeout) => this.obsidianApiProvider.notify(message, timeout),
                requestHttp: (options) => this.obsidianApiProvider.requestHttp(options),
                logger: {
                    debug(message: string, metadata?: unknown): void {
                        DebugLogger.debug(message, metadata);
                    },
                    info(message: string, metadata?: unknown): void {
                        DebugLogger.info(message, metadata);
                    },
                    warn(message: string, metadata?: unknown): void {
                        DebugLogger.warn(message, metadata);
                    },
                    error(message: string, metadata?: unknown): void {
                        DebugLogger.error(message, metadata);
                    },
                },
            }),
        );

        this.aiRuntimeAssembler = new AiRuntimeAssembler(this.plugin, this.obsidianApiProvider);

        this.chatAssembler = new ChatAssembler(
            this.plugin,
            this.obsidianApiProvider,
            { createChatRuntimeDeps: () => this.createChatRuntimeDeps() },
        );

        this.queryFacade = new FeatureQueryFacade({
            skillsRuntime: this.skillsRuntime,
            mcpRuntime: this.mcpRuntime,
            obsidianApiProvider: this.obsidianApiProvider,
            getChatFeatureManager: () => this.chatAssembler.getChatFeatureManager(),
        });
    }

    // ── 初始化编排 ────────────────────────────────────

    initializeAiRuntime(settings: PluginSettings): void {
        this.aiRuntimeAssembler.initialize(settings);
        this.chatAssembler.getChatFeatureManager()?.updateProviderSettings(settings.aiRuntime);
    }

    registerChatViewTypesEarly(): void {
        this.chatAssembler.registerChatViewTypesEarly();
    }

    async initializeChat(settings: PluginSettings): Promise<void> {
        await this.initializeSkills();
        await this.chatAssembler.initializeChat(settings);
    }

    async initializeMcp(settings: PluginSettings): Promise<void> {
        await this.mcpRuntime.initialize(settings.aiRuntime.mcp);
    }

    async initializeSkills(): Promise<void> {
        await this.skillsRuntime.initialize();
    }

    // ── 刷新编排 ──────────────────────────────────────

    async refresh(settings: PluginSettings): Promise<void> {
        this.initializeAiRuntime(settings);
        await this.initializeMcp(settings);
        if (this.chatAssembler.getChatFeatureManager()) {
            await this.initializeChat(settings);
        }
    }

    // ── 查询门面委托（保持外部 API 兼容） ─────────────

    getChatFeatureManager() {
        return this.queryFacade.getChatFeatureManager();
    }

    getObsidianApiProvider() {
        return this.queryFacade.getObsidianApiProvider();
    }

    getMcpClientManager(): McpRuntimeManager | null {
        return this.queryFacade.getMcpClientManager();
    }

    registerToolExecutor(executor: ToolExecutor): () => void {
        return this.queryFacade.registerToolExecutor(executor);
    }

    getCustomToolExecutors(): ToolExecutor[] {
        return this.queryFacade.getCustomToolExecutors();
    }

    getInstalledSkillsSnapshot(): SkillScanResult | null {
        return this.queryFacade.getInstalledSkillsSnapshot();
    }

    getSkillScannerService(): SkillScannerService | null {
        return this.queryFacade.getSkillScannerService();
    }

    async scanSkills(): Promise<SkillScanResult> {
        return await this.queryFacade.scanSkills();
    }

    async refreshSkills(): Promise<SkillScanResult> {
        return await this.queryFacade.refreshSkills();
    }

    onSkillsChange(listener: (result: SkillScanResult) => void): () => void {
        return this.queryFacade.onSkillsChange(listener);
    }

    async refreshQuickActionsCache(): Promise<void> {
        await this.queryFacade.refreshQuickActionsCache();
    }

    // ── 生命周期 ──────────────────────────────────────

    dispose(): void {
        this.skillsRuntime.dispose();
        this.queryFacade.clearToolExecutors();
        this.mcpRuntime.dispose();
        this.aiRuntimeAssembler.dispose();
        this.chatAssembler.dispose();
    }

    // ── 内部：构建 ChatRuntimeDeps ────────────────────

    private createChatRuntimeDeps(): ChatRuntimeDeps {
        return {
            ensureSkillsInitialized: async () => {
                await this.initializeSkills();
            },
            getSkillScannerService: () => this.queryFacade.getSkillScannerService(),
            getInstalledSkillsSnapshot: () => this.queryFacade.getInstalledSkillsSnapshot(),
            scanSkills: async () => await this.queryFacade.scanSkills(),
            refreshSkills: async () => await this.queryFacade.refreshSkills(),
            onSkillsChange: (listener) => this.queryFacade.onSkillsChange(listener),
            ensureMcpInitialized: async () => {
                await this.initializeMcp(this.plugin.settings);
            },
            getMcpClientManager: () => this.queryFacade.getMcpClientManager(),
            getCustomToolExecutors: () => this.queryFacade.getCustomToolExecutors(),
        };
    }
}
