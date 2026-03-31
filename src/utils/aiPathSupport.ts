export const AI_PROMPTS_SUBFOLDER = 'ai prompts';
export const AI_CHAT_HISTORY_SUBFOLDER = 'chat-history';
export const AI_CHAT_HISTORY_FILES_SUBFOLDER = 'files';
export const AI_QUICK_ACTIONS_SUBFOLDER = 'quick-actions';
export const AI_SYSTEM_PROMPTS_SUBFOLDER = 'system-prompts';
export const AI_MCP_SERVERS_SUBFOLDER = 'mcp-servers';
export const AI_MULTI_MODEL_SUBFOLDER = 'multi-model';
export const AI_SKILLS_SUBFOLDER = 'skills';
export const AI_AGENTS_SUBFOLDER = 'agents';
export const AI_CHAT_INPUT_IMPORTS_SUBFOLDER = 'chat-input-imports';

export const trimTrailingSlash = (value: string): string => value.replace(/[\\/]+$/gu, '');

export const normalizeVaultPath = (value: string): string => {
	return value
		.replace(/\\/gu, '/')
		.replace(/\/+/gu, '/')
		.replace(/^\/+?/u, '')
		.replace(/\/$/u, '');
};

const joinAiPath = (aiDataFolder: string, subfolder: string): string => {
	const basePath = trimTrailingSlash(aiDataFolder);
	return normalizeVaultPath(basePath ? `${basePath}/${subfolder}` : subfolder);
};

export const getPromptTemplatePath = (aiDataFolder: string): string => {
	return joinAiPath(aiDataFolder, AI_PROMPTS_SUBFOLDER);
};

export const getChatHistoryPath = (aiDataFolder: string): string => {
	return joinAiPath(aiDataFolder, AI_CHAT_HISTORY_SUBFOLDER);
};

export const getChatHistoryFilesPath = (aiDataFolder: string): string => {
	return normalizeVaultPath(
		`${getChatHistoryPath(aiDataFolder)}/${AI_CHAT_HISTORY_FILES_SUBFOLDER}`,
	);
};

export const getQuickActionsPath = (aiDataFolder: string): string => {
	return joinAiPath(aiDataFolder, AI_QUICK_ACTIONS_SUBFOLDER);
};

export const getSystemPromptsPath = (aiDataFolder: string): string => {
	return joinAiPath(aiDataFolder, AI_SYSTEM_PROMPTS_SUBFOLDER);
};

export const getMcpServersPath = (aiDataFolder: string): string => {
	return joinAiPath(aiDataFolder, AI_MCP_SERVERS_SUBFOLDER);
};

export const getMultiModelConfigPath = (aiDataFolder: string): string => {
	return joinAiPath(aiDataFolder, AI_MULTI_MODEL_SUBFOLDER);
};

export const getSkillsPath = (aiDataFolder: string): string => {
	return joinAiPath(aiDataFolder, AI_SKILLS_SUBFOLDER);
};

export const getAgentsPath = (aiDataFolder: string): string => {
	return joinAiPath(aiDataFolder, AI_AGENTS_SUBFOLDER);
};

export const getChatInputImportsPath = (aiDataFolder: string): string => {
	return joinAiPath(aiDataFolder, AI_CHAT_INPUT_IMPORTS_SUBFOLDER);
};