export const SHARED_TOOL_HELPER_DIRECTORY = '_shared' as const;

export const BUILTIN_TOOL_MODULE_FILES = [
	'tool.ts',
	'schema.ts',
	'description.ts',
	'service.ts',
] as const;

export type BuiltinToolModuleFileName =
	typeof BUILTIN_TOOL_MODULE_FILES[number];

export interface BuiltinToolModuleRoleDoc {
	readonly fileName: BuiltinToolModuleFileName;
	readonly purpose: string;
}

export const BUILTIN_TOOL_MODULE_LAYOUT: Record<
	BuiltinToolModuleFileName,
	BuiltinToolModuleRoleDoc
> = {
	'tool.ts': {
		fileName: 'tool.ts',
		purpose: '放置 BuiltinTool 工厂、邻近元数据与兼容桥接入口。',
	},
	'schema.ts': {
		fileName: 'schema.ts',
		purpose: '放置参数与结果 schema，以及相关类型导出。',
	},
	'description.ts': {
		fileName: 'description.ts',
		purpose: '放置工具描述、何时使用与兼容提示等文本元数据。',
	},
	'service.ts': {
		fileName: 'service.ts',
		purpose: '放置纯业务逻辑、查询助手和副作用封装。',
	},
};

