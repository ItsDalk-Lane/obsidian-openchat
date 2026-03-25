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

const asRecord = (value: unknown): Record<string, unknown> => {
    return value && typeof value === 'object'
        ? value as Record<string, unknown>
        : {};
};

const deleteFields = (value: unknown, fields: readonly string[]): void => {
    const target = asRecord(value);
    for (const field of fields) {
        delete target[field];
    }
};

const getBooleanField = (value: unknown, field: string): boolean | undefined => {
    const fieldValue = asRecord(value)[field];
    return typeof fieldValue === 'boolean' ? fieldValue : undefined;
};

const getStringOrNullField = (
    value: unknown,
    field: string
): string | null | undefined => {
    const fieldValue = asRecord(value)[field];
    if (typeof fieldValue === 'string' || fieldValue === null) {
        return fieldValue;
    }
    return undefined;
};

const CHAT_RUNTIME_ONLY_FIELDS = ['quickActions', 'skills'] as const;
const CHAT_LEGACY_FIELDS = [
    'chatFolder',
    'enableInternalLinkParsing',
    'parseLinksInTemplates',
    'maxLinkParseDepth',
    'linkParseTimeout',
    'enableSelectionToolbar',
    'maxToolbarButtons',
    'selectionToolbarStreamOutput',
] as const;
const AI_RUNTIME_LEGACY_FIELDS = [
    'enableDefaultSystemMsg',
    'defaultSystemMsg',
    'systemPromptsData',
    'enableInternalLink',
    'maxLinkParseDepth',
    'linkParseTimeout',
] as const;
const AI_RUNTIME_RUNTIME_ONLY_FIELDS = ['editorStatus', 'vendorApiKeys'] as const;
const LEGACY_TOP_LEVEL_FIELDS = ['promptTemplateFolder', 'tars'] as const;

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
        const persistedAiRuntime = this.migrationService.resolvePersistedAiRuntime(persisted);
        const aiRuntimeSettings = this.secretManager.decryptAiRuntimeSettings(persistedAiRuntime);
        const aiDataFolder = this.migrationService.resolveAiDataFolder(persisted, rawChatSettings);

        // 迁移旧版默认系统消息到 Markdown 系统提示词目录（向下兼容）
        try {
            const systemPromptService = SystemPromptDataService.getInstance(this.plugin.app);
            const legacyEnabled = getBooleanField(aiRuntimeSettings, 'enableDefaultSystemMsg');
            const legacyContent = getStringOrNullField(aiRuntimeSettings, 'defaultSystemMsg');
            const migrated = await systemPromptService.migrateFromLegacyDefaultSystemMessage({
                enabled: legacyEnabled,
                content: legacyContent,
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
    deleteFields(aiRuntimeSettings, ['enableDefaultSystemMsg', 'defaultSystemMsg', 'systemPromptsData']);

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { promptTemplateFolder: _legacyPromptTemplateFolder, ...persistedWithoutLegacyTop } = persisted;
        /* eslint-disable @typescript-eslint/no-unused-vars */
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
        /* eslint-enable @typescript-eslint/no-unused-vars */

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
        deleteFields(encryptedAiRuntime, ['enableDefaultSystemMsg', 'defaultSystemMsg']);

        // 基于当前 data.json 合并写回，避免覆盖由独立服务维护的字段
        const persisted = (await this.plugin.loadData()) ?? {};
        const persistedChat = persisted?.chat ?? {};
        const persistedAiRuntime = this.migrationService.resolvePersistedAiRuntime(persisted);

        const mergedChat = {
            ...persistedChat,
            ...settings.chat,
        };
        deleteFields(mergedChat, [...CHAT_RUNTIME_ONLY_FIELDS, ...CHAT_LEGACY_FIELDS]);
        const mergedAiRuntime = {
            ...persistedAiRuntime,
            ...encryptedAiRuntime,
        };
        deleteFields(
            mergedAiRuntime,
            [...AI_RUNTIME_LEGACY_FIELDS, ...AI_RUNTIME_RUNTIME_ONLY_FIELDS]
        );
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
            ...((asRecord(mergedAiRuntime).mcp ?? {}) as Record<string, unknown>),
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
        asRecord(mergedAiRuntime).mcp = mergedMcpSettings;

        const settingsToPersist = {
            ...persisted,
            ...settings,
            chat: mergedChat,
            aiRuntime: mergedAiRuntime,
        };
        deleteFields(settingsToPersist, LEGACY_TOP_LEVEL_FIELDS);
        await this.plugin.saveData(settingsToPersist);
    }
}
