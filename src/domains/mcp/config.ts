/**
 * @module mcp/config
 * @description 提供外部 MCP 运行时域的默认配置与归一化逻辑。
 *
 * @dependencies src/domains/mcp/types
 * @side-effects 无
 * @invariants 返回值始终为可安全消费的浅拷贝对象。
 */

import type { McpSettings } from './types';

export const DEFAULT_BUILTIN_TIME_TIMEZONE = 'Asia/Shanghai';

export const DEFAULT_MCP_SETTINGS: McpSettings = {
	servers: [],
	builtinCoreToolsEnabled: true,
	builtinFilesystemEnabled: true,
	builtinFetchEnabled: true,
	builtinFetchIgnoreRobotsTxt: false,
	builtinBingSearchEnabled: true,
	builtinTimeDefaultTimezone: DEFAULT_BUILTIN_TIME_TIMEZONE,
	maxToolCallLoops: 10,
};

/** @precondition settings 可以为空或部分字段缺失 @postcondition 返回可安全消费且数组字段已复制的 MCP 设置 @throws 从不抛出 @example resolveMcpRuntimeSettings({ servers: [] }) */
export function resolveMcpRuntimeSettings(
	settings?: McpSettings | null,
): McpSettings {
	const resolved = {
		...DEFAULT_MCP_SETTINGS,
		...(settings ?? {}),
	};

	return {
		...resolved,
		servers: [...(settings?.servers ?? [])],
		disabledBuiltinToolNames: settings?.disabledBuiltinToolNames
			? [...settings.disabledBuiltinToolNames]
			: undefined,
	};
}