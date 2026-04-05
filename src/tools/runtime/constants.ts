export const BUILTIN_SERVER_ID = '__builtin__:tools';
export const BUILTIN_SERVER_NAME = '内置工具';

/**
 * @deprecated 内置工具已统一到 BUILTIN_SERVER_ID。
 */
export const BUILTIN_CORE_TOOLS_SERVER_ID = '__builtin__:core-tools';
/**
 * @deprecated 内置工具已统一到 BUILTIN_SERVER_ID。
 */
export const BUILTIN_FILESYSTEM_SERVER_ID = '__builtin__:mcp-filesystem';
/**
 * @deprecated 内置工具已统一到 BUILTIN_SERVER_ID。
 */
export const BUILTIN_FILESYSTEM_SERVER_NAME = '内置 Filesystem 工具';
/**
 * @deprecated 内置工具已统一到 BUILTIN_SERVER_ID。
 */
export const BUILTIN_FETCH_SERVER_ID = '__builtin__:mcp-fetch';
/**
 * @deprecated 内置工具已统一到 BUILTIN_SERVER_ID。
 */
export const BUILTIN_BING_SEARCH_SERVER_ID = '__builtin__:mcp-bing-search';
/**
 * @deprecated 内置工具已统一到 BUILTIN_SERVER_ID。
 */
export const BUILTIN_SKILLS_SERVER_ID = 'builtin_skills_server';

export const LEGACY_BUILTIN_SERVER_IDS = [
	BUILTIN_CORE_TOOLS_SERVER_ID,
	BUILTIN_FILESYSTEM_SERVER_ID,
	BUILTIN_FETCH_SERVER_ID,
	BUILTIN_BING_SEARCH_SERVER_ID,
	BUILTIN_SKILLS_SERVER_ID,
] as const;

export const isBuiltinServerId = (serverId: string): boolean => {
	return serverId === BUILTIN_SERVER_ID || LEGACY_BUILTIN_SERVER_IDS.includes(
		serverId as (typeof LEGACY_BUILTIN_SERVER_IDS)[number]
	);
};

export const DEFAULT_FETCH_MAX_LENGTH = 5000;
export const DEFAULT_FETCH_USER_AGENT = 'ModelContextProtocol/1.0 (Autonomous; +https://github.com/modelcontextprotocol/servers)';
export const DEFAULT_FETCH_MAX_CONTENT_LENGTH = 5_000_000;

export const DEFAULT_SCRIPT_TIMEOUT_MS = 15_000;
export const DEFAULT_QUERY_MAX_ROWS = 200;
export const DEFAULT_SHELL_TIMEOUT_MS = 15_000;
export const DEFAULT_SHELL_MAX_BUFFER = 1024 * 1024;
export const DEFAULT_SEARCH_MAX_RESULTS = 50;
export const DEFAULT_TOOL_RESULT_TEXT_LIMIT = 25_000;
export const DEFAULT_TEXT_FILE_MAX_CHARS = 20_000;
