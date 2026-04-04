import {
	BUILTIN_SERVER_ID,
	BUILTIN_SERVER_NAME,
} from 'src/tools/runtime/constants';
import type { McpRuntimeManager } from 'src/domains/mcp/types';
import type { ChatRuntimeDeps } from '../runtime/chat-runtime-deps';

export const BUILTIN_FILESYSTEM_ROUTING_HINT =
	'全局文件工具路由规则：只知道名称或路径片段时先用 find_paths；已经知道 directory_path 且只看一层目录时用 list_directory_flat；需要递归目录树时用 list_directory_tree；已经知道 file_path 要读内容时用 read_file；搜索正文内容用 search_content；查询标签、任务、属性或文件统计时才用 query_index。';

export const BUILTIN_FILESYSTEM_TOOL_NAMES = new Set([
	'read_file',
	'read_media',
	'read_files',
	'write_file',
	'edit_file',
	'create_directory',
	'list_directory_flat',
	'list_directory_tree',
	'list_vault_overview',
	'move_path',
	'delete_path',
	'find_paths',
	'search_content',
	'query_index',
	'stat_path',
]);

export const getEnabledChatMcpServers = (
	runtimeDeps: ChatRuntimeDeps,
	mcpManager: McpRuntimeManager | null | undefined,
	builtinSettings:
		| {
			builtinCoreToolsEnabled?: boolean;
			builtinFilesystemEnabled?: boolean;
			builtinFetchEnabled?: boolean;
			builtinBingSearchEnabled?: boolean;
		}
		| undefined,
): Array<{ id: string; name: string }> => {
	const externalServers = mcpManager?.getEnabledServerSummaries() ?? [];
	const hasBuiltinTools =
		builtinSettings?.builtinCoreToolsEnabled !== false
		|| builtinSettings?.builtinFilesystemEnabled !== false
		|| builtinSettings?.builtinFetchEnabled !== false
		|| builtinSettings?.builtinBingSearchEnabled !== false
		|| (runtimeDeps.getInstalledSkillsSnapshot()?.skills.length ?? 0) > 0;
	if (!hasBuiltinTools) {
		return externalServers;
	}
	return [
		{ id: BUILTIN_SERVER_ID, name: BUILTIN_SERVER_NAME },
		...externalServers,
	];
};

export const createActualMcpCallTool = (
	mcpManager?: McpRuntimeManager | null,
): ((serverId: string, name: string, args: Record<string, unknown>) => Promise<string>) | null => {
	if (!mcpManager) {
		return null;
	}
	return async (serverId: string, name: string, args: Record<string, unknown>) => {
		return await mcpManager.callActualTool(serverId, name, args);
	};
};
