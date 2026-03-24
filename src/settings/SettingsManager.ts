import { Plugin } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS } from './PluginSettings';
import { DEFAULT_CHAT_SETTINGS, type ChatSettings } from 'src/types/chat';
import { DebugLogger } from 'src/utils/DebugLogger';
import { SystemPromptDataService } from 'src/settings/system-prompts/SystemPromptDataService';
import { McpServerDataService } from 'src/services/mcp/McpServerDataService';
import type { McpSettings } from 'src/services/mcp/types';
import { DEFAULT_MCP_SETTINGS } from 'src/services/mcp/types';
import { SettingsSecretManager } from './SettingsSecretManager';
import { SettingsMigrationService } from './SettingsMigrationService';
import {
    readLegacyAiRuntimeSettings,
    removeLegacyAiRuntimeContainer,
} from './legacyCompatibility';

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
        const persistedAiRuntime = persisted?.aiRuntime ?? readLegacyAiRuntimeSettings(persisted);
        const aiRuntimeSettings = this.secretManager.decryptAiRuntimeSettings(persistedAiRuntime);
        const aiDataFolder = this.migrationService.resolveAiDataFolder(persisted, rawChatSettings);

        // 迁移旧版默认系统消息到 Markdown 系统提示词目录（向下兼容）
        try {
            const systemPromptService = SystemPromptDataService.getInstance(this.plugin.app);
            const migrated = await systemPromptService.migrateFromLegacyDefaultSystemMessage({
                enabled: (aiRuntimeSettings as any)?.enableDefaultSystemMsg,
                content: (aiRuntimeSettings as any)?.defaultSystemMsg
            });
            if (migrated) {
                aiRuntimeSettings.enableGlobalSystemPrompts = true;
            }
        } catch (error) {
            DebugLogger.error('[SettingsManager] 迁移默认系统消息失败（忽略，继续加载）', error);
        }

        // 从 Markdown 目录加载外部 MCP 服务器（内置 MCP 配置仍走 settings）
        try {
            const mcpServerService = McpServerDataService.getInstance(this.plugin.app);
            const markdownServers = await mcpServerService.loadServers(aiDataFolder);
            aiRuntimeSettings.mcp = {
                ...DEFAULT_MCP_SETTINGS,
                ...(aiRuntimeSettings.mcp ?? {}),
                servers: markdownServers,
            };
        } catch (error) {
            DebugLogger.error('[SettingsManager] 加载 MCP 服务器 Markdown 配置失败，回退空列表', error);
            aiRuntimeSettings.mcp = {
                ...DEFAULT_MCP_SETTINGS,
                ...(aiRuntimeSettings.mcp ?? {}),
                servers: [],
            };
        }

        // 剥离旧字段，避免继续在运行期被引用
        delete (aiRuntimeSettings as any).enableDefaultSystemMsg;
        delete (aiRuntimeSettings as any).defaultSystemMsg;
        delete (aiRuntimeSettings as any).systemPromptsData;

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
            aiRuntime: aiRuntimeSettings,
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
        const encryptedAiRuntime = this.secretManager.encryptAiRuntimeSettings(settings.aiRuntime);
        // 剥离旧字段，避免写回 data.json
        delete (encryptedAiRuntime as any).enableDefaultSystemMsg;
        delete (encryptedAiRuntime as any).defaultSystemMsg;

        // 基于当前 data.json 合并写回，避免覆盖由独立服务维护的字段
        const persisted = (await this.plugin.loadData()) ?? {};
        const persistedChat = persisted?.chat ?? {};
        const persistedAiRuntime = persisted?.aiRuntime ?? readLegacyAiRuntimeSettings(persisted) ?? {};

        const mergedChat = {
            ...persistedChat,
            ...settings.chat,
        };
        delete (mergedChat as any).chatFolder;
        delete (mergedChat as any).quickActions;
        delete (mergedChat as any).skills;
        // 剥离已废弃的内链解析旧字段（兼容读取仅保留在迁移层）
        delete (mergedChat as any).enableInternalLinkParsing;
        delete (mergedChat as any).parseLinksInTemplates;
        delete (mergedChat as any).maxLinkParseDepth;
        delete (mergedChat as any).linkParseTimeout;
        // 剥离已废弃的选择工具栏旧字段（已迁移到 quickActions 系列）
        delete (mergedChat as any).enableSelectionToolbar;
        delete (mergedChat as any).maxToolbarButtons;
        delete (mergedChat as any).selectionToolbarStreamOutput;
        const mergedAiRuntime = {
            ...persistedAiRuntime,
            ...encryptedAiRuntime,
        };
        delete (mergedAiRuntime as any).enableDefaultSystemMsg;
        delete (mergedAiRuntime as any).defaultSystemMsg;
        delete (mergedAiRuntime as any).systemPromptsData;
        // 剥离运行时状态字段（不应持久化）
        delete (mergedAiRuntime as any).editorStatus;
        // 剥离运行时明文密钥（实际密钥存储在 vendorApiKeysByDevice 中）
        delete (mergedAiRuntime as any).vendorApiKeys;
        // 剥离已废弃的内链解析旧字段（已迁移到 internalLinkParsing）
        delete (mergedAiRuntime as any).enableInternalLink;
        delete (mergedAiRuntime as any).maxLinkParseDepth;
        delete (mergedAiRuntime as any).linkParseTimeout;
        const normalizedAiDataFolder = this.migrationService.normalizeLegacyFolderPath(settings.aiDataFolder) || DEFAULT_SETTINGS.aiDataFolder;
        const mcpServerService = McpServerDataService.getInstance(this.plugin.app);
        const runtimeMcpSettings: McpSettings = {
            ...DEFAULT_MCP_SETTINGS,
            ...(settings.aiRuntime.mcp ?? {}),
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
        settings.aiRuntime.mcp = {
            ...runtimeMcpSettings,
            servers: normalizedMcpServers,
        };

        const mergedMcpSettings = {
            ...DEFAULT_MCP_SETTINGS,
            ...((mergedAiRuntime as any).mcp ?? {}),
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
        (mergedAiRuntime as any).mcp = mergedMcpSettings;

        const settingsToPersist = {
            ...persisted,
            ...settings,
            chat: mergedChat,
            aiRuntime: mergedAiRuntime,
        };
        delete (settingsToPersist as any).promptTemplateFolder;
        removeLegacyAiRuntimeContainer(settingsToPersist as any);

        await this.plugin.saveData(settingsToPersist);
    }
}
