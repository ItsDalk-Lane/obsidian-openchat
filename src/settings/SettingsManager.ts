import { Plugin } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS } from './PluginSettings';
import { DEFAULT_CHAT_SETTINGS, type ChatSettings } from 'src/features/chat';
import { DebugLogger } from 'src/utils/DebugLogger';
import { SystemPromptDataService } from 'src/systemPrompts/SystemPromptDataService';
import { McpServerDataService } from 'src/mcp/client/McpServerDataService';
import type { McpSettings } from 'src/mcp/client/types';
import { DEFAULT_MCP_SETTINGS } from 'src/mcp/client/types';
import { SettingsSecretManager } from './SettingsSecretManager';
import { SettingsMigrationService } from './SettingsMigrationService';

export class SettingsManager {
    private readonly secretManager: SettingsSecretManager;
    private readonly migrationService: SettingsMigrationService;

    constructor(private plugin: Plugin) {
        this.secretManager = new SettingsSecretManager();
        this.migrationService = new SettingsMigrationService(plugin);
    }

    async load(): Promise<PluginSettings> {
        const persisted = (await this.plugin.loadData()) ?? {};
        const rawChatSettings = persisted?.chat ?? {};
        const legacyQuickActionSettings = rawChatSettings as {
            enableSelectionToolbar?: boolean;
            maxToolbarButtons?: number;
            selectionToolbarStreamOutput?: boolean;
        };
        const mergedChat = {
            ...DEFAULT_CHAT_SETTINGS,
            ...rawChatSettings,
            enableQuickActions:
                rawChatSettings?.enableQuickActions
                ?? legacyQuickActionSettings.enableSelectionToolbar
                ?? DEFAULT_CHAT_SETTINGS.enableQuickActions,
            maxQuickActionButtons:
                rawChatSettings?.maxQuickActionButtons
                ?? legacyQuickActionSettings.maxToolbarButtons
                ?? DEFAULT_CHAT_SETTINGS.maxQuickActionButtons,
            quickActionsStreamOutput:
                rawChatSettings?.quickActionsStreamOutput
                ?? legacyQuickActionSettings.selectionToolbarStreamOutput
                ?? DEFAULT_CHAT_SETTINGS.quickActionsStreamOutput,
        };
        const tarsSettings = this.secretManager.decryptTarsSettings(persisted?.tars?.settings);
        const aiDataFolder = this.migrationService.resolveAiDataFolder(persisted, rawChatSettings);

        // 迁移旧版默认系统消息到 Markdown 系统提示词目录（向下兼容）
        try {
            const systemPromptService = SystemPromptDataService.getInstance(this.plugin.app);
            const migrated = await systemPromptService.migrateFromLegacyDefaultSystemMessage({
                enabled: (tarsSettings as any)?.enableDefaultSystemMsg,
                content: (tarsSettings as any)?.defaultSystemMsg
            });
            if (migrated) {
                tarsSettings.enableGlobalSystemPrompts = true;
            }
        } catch (error) {
            DebugLogger.error('[SettingsManager] 迁移默认系统消息失败（忽略，继续加载）', error);
        }

        // 从 Markdown 目录加载外部 MCP 服务器（内置 MCP 配置仍走 settings）
        try {
            const mcpServerService = McpServerDataService.getInstance(this.plugin.app);
            const markdownServers = await mcpServerService.loadServers(aiDataFolder);
            tarsSettings.mcp = {
                ...DEFAULT_MCP_SETTINGS,
                ...(tarsSettings.mcp ?? {}),
                servers: markdownServers,
            };
        } catch (error) {
            DebugLogger.error('[SettingsManager] 加载 MCP 服务器 Markdown 配置失败，回退空列表', error);
            tarsSettings.mcp = {
                ...DEFAULT_MCP_SETTINGS,
                ...(tarsSettings.mcp ?? {}),
                servers: [],
            };
        }

        // 剥离旧字段，避免继续在运行期被引用
        delete (tarsSettings as any).enableDefaultSystemMsg;
        delete (tarsSettings as any).defaultSystemMsg;
        delete (tarsSettings as any).systemPromptsData;

        const { promptTemplateFolder: _legacyPromptTemplateFolder, ...persistedWithoutLegacyTop } = persisted;
        const {
            chatFolder: _legacyChatFolder,
            enableSelectionToolbar: _legacyEnableSelectionToolbar,
            maxToolbarButtons: _legacyMaxToolbarButtons,
            selectionToolbarStreamOutput: _legacySelectionToolbarStreamOutput,
            quickActions: _legacyQuickActions,
            skills: _legacySkills,
            ...chatWithoutLegacy
        } = mergedChat as ChatSettings & {
            chatFolder?: string;
            enableSelectionToolbar?: boolean;
            maxToolbarButtons?: number;
            selectionToolbarStreamOutput?: boolean;
            quickActions?: unknown;
            skills?: unknown;
        };

        return {
            ...DEFAULT_SETTINGS,
            ...persistedWithoutLegacyTop,
            aiDataFolder,
            tars: {
                settings: tarsSettings,
            },
            chat: {
                ...chatWithoutLegacy,
                quickActions: [],
            },
        };
    }

    async migrateAIDataStorage(settings: PluginSettings): Promise<void> {
        return this.migrationService.migrateAIDataStorage(settings);
    }

    async cleanupLegacyAIStorage(): Promise<void> {
        return this.migrationService.cleanupLegacyAIStorage();
    }

    async save(settings: PluginSettings): Promise<void> {
        const encryptedTars = this.secretManager.encryptTarsSettings(settings.tars.settings);
        // 剥离旧字段，避免写回 data.json
        delete (encryptedTars as any).enableDefaultSystemMsg;
        delete (encryptedTars as any).defaultSystemMsg;

        // 基于当前 data.json 合并写回，避免覆盖由独立服务维护的字段
        const persisted = (await this.plugin.loadData()) ?? {};
        const persistedChat = persisted?.chat ?? {};
        const persistedTarsSettings = persisted?.tars?.settings ?? {};

        const mergedChat = {
            ...persistedChat,
            ...settings.chat,
        };
        delete (mergedChat as any).chatFolder;
        delete (mergedChat as any).quickActions;
        delete (mergedChat as any).skills;
        // 剥离已废弃的内链解析旧字段（已迁移到 tars.settings.internalLinkParsing）
        delete (mergedChat as any).enableInternalLinkParsing;
        delete (mergedChat as any).parseLinksInTemplates;
        delete (mergedChat as any).maxLinkParseDepth;
        delete (mergedChat as any).linkParseTimeout;
        // 剥离已废弃的选择工具栏旧字段（已迁移到 quickActions 系列）
        delete (mergedChat as any).enableSelectionToolbar;
        delete (mergedChat as any).maxToolbarButtons;
        delete (mergedChat as any).selectionToolbarStreamOutput;
        const mergedTarsSettings = {
            ...persistedTarsSettings,
            ...encryptedTars,
        };
        delete (mergedTarsSettings as any).enableDefaultSystemMsg;
        delete (mergedTarsSettings as any).defaultSystemMsg;
        delete (mergedTarsSettings as any).systemPromptsData;
        // 剥离运行时状态字段（不应持久化）
        delete (mergedTarsSettings as any).editorStatus;
        // 剥离运行时明文密钥（实际密钥存储在 vendorApiKeysByDevice 中）
        delete (mergedTarsSettings as any).vendorApiKeys;
        // 剥离已废弃的内链解析旧字段（已迁移到 internalLinkParsing）
        delete (mergedTarsSettings as any).enableInternalLink;
        delete (mergedTarsSettings as any).maxLinkParseDepth;
        delete (mergedTarsSettings as any).linkParseTimeout;
        const normalizedAiDataFolder = this.migrationService.normalizeLegacyFolderPath(settings.aiDataFolder) || DEFAULT_SETTINGS.aiDataFolder;
        const mcpServerService = McpServerDataService.getInstance(this.plugin.app);
        const runtimeMcpSettings: McpSettings = {
            ...DEFAULT_MCP_SETTINGS,
            ...(settings.tars.settings.mcp ?? {}),
        };
        for (const removedBuiltinField of [
            'builtinVaultEnabled',
            'builtinObsidianSearchEnabled',
            'builtinMemoryEnabled',
            'builtinSequentialThinkingEnabled',
            'builtinMemoryFilePath',
            'builtinSequentialThinkingDisableThoughtLogging',
        ] as const) {
            delete (runtimeMcpSettings as Record<string, unknown>)[removedBuiltinField];
        }
        const normalizedMcpServers = await mcpServerService.syncServers(
            normalizedAiDataFolder,
            runtimeMcpSettings.servers ?? []
        );
        settings.tars.settings.mcp = {
            ...runtimeMcpSettings,
            servers: normalizedMcpServers,
        };

        const mergedMcpSettings = {
            ...DEFAULT_MCP_SETTINGS,
            ...((mergedTarsSettings as any).mcp ?? {}),
        } as Record<string, unknown>;
        delete mergedMcpSettings.servers;
        for (const removedBuiltinField of [
            'builtinVaultEnabled',
            'builtinObsidianSearchEnabled',
            'builtinMemoryEnabled',
            'builtinSequentialThinkingEnabled',
            'builtinMemoryFilePath',
            'builtinSequentialThinkingDisableThoughtLogging',
        ] as const) {
            delete mergedMcpSettings[removedBuiltinField];
        }
        (mergedTarsSettings as any).mcp = mergedMcpSettings;

        const settingsToPersist = {
            ...persisted,
            ...settings,
            chat: mergedChat,
            tars: {
                ...(persisted?.tars ?? {}),
                ...(settings?.tars ?? {}),
                settings: mergedTarsSettings,
            },
        };
        delete (settingsToPersist as any).promptTemplateFolder;

        await this.plugin.saveData(settingsToPersist);
    }
}