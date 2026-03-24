import { Plugin } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS } from './PluginSettings';
import { DebugLogger } from 'src/utils/DebugLogger';
import {
    canDeriveAIDataFolderFromLegacy,
    ensureAIDataFolders,
    getChatHistoryPath,
    getPromptTemplatePath,
    moveFolderFilesWithRenameOnConflict,
} from 'src/utils/AIPathManager';

const LEGACY_QUICK_ACTIONS_DATA_FILE = '.obsidian/plugins/openchat/skills.json';
const LEGACY_SYSTEM_PROMPTS_DATA_FILE = '.obsidian/plugins/openchat/system-prompts.json';

/**
 * 负责 AI 数据目录迁移、旧版数据清理及文件夹路径规范化
 */
export class SettingsMigrationService {
    constructor(private readonly plugin: Plugin) {}

    async migrateAIDataStorage(settings: PluginSettings): Promise<void> {
        const persisted = (await this.plugin.loadData()) ?? {};
        const rawChatSettings = persisted?.chat ?? {};
        const legacyPromptTemplateFolder = this.normalizeLegacyFolderPath(persisted?.promptTemplateFolder);
        const legacyChatFolder = this.normalizeLegacyFolderPath(rawChatSettings?.chatFolder);
        const aiDataFolder = this.normalizeLegacyFolderPath(settings.aiDataFolder) || DEFAULT_SETTINGS.aiDataFolder;

        await ensureAIDataFolders(this.plugin.app, aiDataFolder);

        const promptTargetFolder = getPromptTemplatePath(aiDataFolder);
        const chatTargetFolder = getChatHistoryPath(aiDataFolder);

        let movedCount = 0;
        if (legacyPromptTemplateFolder && legacyPromptTemplateFolder !== promptTargetFolder) {
            movedCount += await moveFolderFilesWithRenameOnConflict(
                this.plugin.app,
                legacyPromptTemplateFolder,
                promptTargetFolder
            );
        }

        if (legacyChatFolder && legacyChatFolder !== chatTargetFolder) {
            movedCount += await moveFolderFilesWithRenameOnConflict(
                this.plugin.app,
                legacyChatFolder,
                chatTargetFolder
            );
        }

        const persistedWithoutLegacyTop: Record<string, unknown> = { ...(persisted as Record<string, unknown>) };
        delete persistedWithoutLegacyTop.promptTemplateFolder;
        const persistedChatWithoutLegacy: Record<string, unknown> = { ...((persistedWithoutLegacyTop.chat ?? {}) as Record<string, unknown>) };
        delete persistedChatWithoutLegacy.chatFolder;

        const nextData = {
            ...persistedWithoutLegacyTop,
            aiDataFolder,
            chat: persistedChatWithoutLegacy,
        };

        await this.plugin.saveData(nextData);

        if (movedCount > 0) {
            DebugLogger.info(`[SettingsManager] AI数据目录迁移完成，迁移文件数量: ${movedCount}`);
        }
    }

    async cleanupLegacyAIStorage(): Promise<void> {
        const persisted = (await this.plugin.loadData()) ?? {};
        let changed = false;

        const nextData: Record<string, unknown> = { ...persisted };
        const nextChat: Record<string, unknown> = { ...(persisted?.chat ?? {}) };
        const nextAiRuntime: Record<string, unknown> = {
            ...((persisted?.aiRuntime ?? {}) as Record<string, unknown>),
        };

        if (Object.prototype.hasOwnProperty.call(nextChat, 'quickActions')) {
            delete nextChat.quickActions;
            changed = true;
        }
        if (Object.prototype.hasOwnProperty.call(nextChat, 'skills')) {
            delete nextChat.skills;
            changed = true;
        }
        if (Object.prototype.hasOwnProperty.call(nextAiRuntime, 'systemPromptsData')) {
            delete nextAiRuntime.systemPromptsData;
            changed = true;
        }
        for (const legacyAiRuntimeField of ['enableInternalLink', 'maxLinkParseDepth', 'linkParseTimeout', 'enableDefaultSystemMsg', 'defaultSystemMsg'] as const) {
            if (Object.prototype.hasOwnProperty.call(nextAiRuntime, legacyAiRuntimeField)) {
                delete nextAiRuntime[legacyAiRuntimeField];
                changed = true;
            }
        }
        for (const legacyRuntimeOnlyField of ['editorStatus', 'vendorApiKeys'] as const) {
            if (Object.prototype.hasOwnProperty.call(nextAiRuntime, legacyRuntimeOnlyField)) {
                delete nextAiRuntime[legacyRuntimeOnlyField];
                changed = true;
            }
        }
        for (const legacyChatField of ['enableInternalLinkParsing', 'parseLinksInTemplates', 'maxLinkParseDepth', 'linkParseTimeout', 'enableSelectionToolbar', 'maxToolbarButtons', 'selectionToolbarStreamOutput'] as const) {
            if (Object.prototype.hasOwnProperty.call(nextChat, legacyChatField)) {
                delete nextChat[legacyChatField];
                changed = true;
            }
        }
        if (nextAiRuntime.mcp && typeof nextAiRuntime.mcp === 'object') {
            const nextMcpSettings = { ...(nextAiRuntime.mcp as Record<string, unknown>) };
            if (Object.prototype.hasOwnProperty.call(nextMcpSettings, 'servers')) {
                delete nextMcpSettings.servers;
                nextAiRuntime.mcp = nextMcpSettings;
                changed = true;
            }
            for (const legacyBuiltinField of [
                'builtinVaultEnabled',
                'builtinObsidianSearchEnabled',
                'builtinMemoryEnabled',
                'builtinSequentialThinkingEnabled',
                'builtinMemoryFilePath',
                'builtinSequentialThinkingDisableThoughtLogging',
            ] as const) {
                if (Object.prototype.hasOwnProperty.call(nextMcpSettings, legacyBuiltinField)) {
                    delete nextMcpSettings[legacyBuiltinField];
                    nextAiRuntime.mcp = nextMcpSettings;
                    changed = true;
                }
            }
        }

        if (changed) {
            nextData.chat = nextChat;
            nextData.aiRuntime = nextAiRuntime;
            await this.plugin.saveData(nextData);
            DebugLogger.info('[SettingsManager] 已清理 data.json 中的旧快捷操作/系统提示词/MCP 服务器存储位点');
        }

        await this.removeLegacyFileIfExists(LEGACY_QUICK_ACTIONS_DATA_FILE);
        await this.removeLegacyFileIfExists(LEGACY_SYSTEM_PROMPTS_DATA_FILE);
        this.cleanupRuntimeLegacyFields();
    }

    resolveAiDataFolder(
        persisted: Record<string, unknown>,
        rawChatSettings: Record<string, unknown>
    ): string {
        const persistedAiDataFolder = this.normalizeLegacyFolderPath(persisted?.aiDataFolder);
        const legacyPromptTemplateFolder = this.normalizeLegacyFolderPath(persisted?.promptTemplateFolder);
        const legacyChatFolder = this.normalizeLegacyFolderPath(rawChatSettings?.chatFolder);

        if (persistedAiDataFolder && persistedAiDataFolder !== DEFAULT_SETTINGS.aiDataFolder) {
            return persistedAiDataFolder;
        }

        const derived = canDeriveAIDataFolderFromLegacy(legacyPromptTemplateFolder, legacyChatFolder);
        if (derived) {
            return derived;
        }

        return persistedAiDataFolder || DEFAULT_SETTINGS.aiDataFolder;
    }

    normalizeLegacyFolderPath(value: unknown): string | undefined {
        if (typeof value !== 'string') {
            return undefined;
        }
        const normalized = value.trim().replace(/[\\/]+$/g, '');
        return normalized.length > 0 ? normalized : undefined;
    }

    private async removeLegacyFileIfExists(path: string): Promise<void> {
        try {
            const exists = await this.plugin.app.vault.adapter.exists(path);
            if (!exists) {
                return;
            }
            await this.plugin.app.vault.adapter.remove(path);
            DebugLogger.info('[SettingsManager] 已删除旧数据文件', path);
        } catch (error) {
            DebugLogger.warn('[SettingsManager] 删除旧数据文件失败（忽略）', { path, error });
        }
    }

    private cleanupRuntimeLegacyFields(): void {
        const runtimeSettings = (this.plugin as Plugin & { settings?: PluginSettings }).settings;
        if (!runtimeSettings) {
            return;
        }
        if (runtimeSettings.chat) {
            runtimeSettings.chat.quickActions = [];
            if ('skills' in (runtimeSettings.chat as unknown as Record<string, unknown>)) {
                delete (runtimeSettings.chat as unknown as Record<string, unknown>).skills;
            }
        }
        if (runtimeSettings.aiRuntime && 'systemPromptsData' in (runtimeSettings.aiRuntime as unknown as Record<string, unknown>)) {
            delete (runtimeSettings.aiRuntime as unknown as Record<string, unknown>).systemPromptsData;
        }
    }
}
