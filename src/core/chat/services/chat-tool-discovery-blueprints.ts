import {
	DISCOVER_SKILLS_TOOL_NAME,
	INVOKE_SKILL_TOOL_NAME,
} from 'src/tools/skill/skill-tools';
import {
	DELEGATE_SUB_AGENT_TOOL_NAME,
	DISCOVER_SUB_AGENTS_TOOL_NAME,
	SUB_AGENT_TOOL_PREFIX,
} from 'src/tools/sub-agents/types';
import {
	summarizeDescriptionForUiFallback,
} from 'src/services/mcp/toolDescriptionSummary';
import type {
	ToolCompatibilityMetadata,
	ToolDefinition,
	ToolDiscoveryMetadata,
	ToolIdentity,
	ToolRuntimePolicy,
} from 'src/types/tool';

type SurfaceSource = ToolIdentity['source'];

export interface SurfaceBlueprint {
	readonly familyId: string;
	readonly source: SurfaceSource;
	readonly visibility: ToolDiscoveryMetadata['discoveryVisibility'];
	readonly argumentComplexity: ToolDiscoveryMetadata['argumentComplexity'];
	readonly riskLevel: ToolDiscoveryMetadata['riskLevel'];
	readonly oneLinePurpose?: string;
	readonly whenToUse?: readonly string[];
	readonly whenNotToUse?: readonly string[];
	readonly requiredArgsSummary?: readonly string[];
	readonly capabilityTags?: readonly string[];
	readonly runtimePolicy?: Partial<ToolRuntimePolicy>;
	readonly compatibility?: Partial<ToolCompatibilityMetadata>;
}

export const BUILTIN_TOOL_BLUEPRINTS: Record<string, SurfaceBlueprint> = {
	run_script: {
		familyId: 'workflow.orchestrate',
		source: 'workflow',
		visibility: 'workflow-only',
		argumentComplexity: 'high',
		riskLevel: 'escape-hatch',
		oneLinePurpose: '用受限脚本编排多个工具调用。',
		capabilityTags: ['workflow', 'orchestrate', '编排', '脚本'],
	},
	run_shell: {
		familyId: 'escape.shell',
		source: 'escape-hatch',
		visibility: 'hidden',
		argumentComplexity: 'high',
		riskLevel: 'escape-hatch',
		oneLinePurpose: '执行本机 shell 命令。',
		capabilityTags: ['shell', 'terminal', 'bash', 'zsh', '终端', '命令行'],
	},
	write_plan: {
		familyId: 'workflow.plan',
		source: 'workflow',
		visibility: 'workflow-only',
		argumentComplexity: 'medium',
		riskLevel: 'mutating',
		oneLinePurpose: '维护当前会话的任务计划状态。',
		capabilityTags: ['plan', 'todo', '任务计划', '步骤'],
	},
	get_time: {
		familyId: 'builtin.time',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'high',
		riskLevel: 'read-only',
		oneLinePurpose: '兼容型时间工具；默认优先使用 get_current_time、convert_time 或 calculate_time_range。',
		capabilityTags: ['time', 'timezone', 'date', '时区', '时间', '日期'],
		requiredArgsSummary: ['mode', 'timezone 或时区参数'],
		compatibility: {
			deprecationStatus: 'legacy',
		},
	},
	get_current_time: {
		familyId: 'builtin.time',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '获取某个时区的当前时间。',
		capabilityTags: ['current time', 'time', 'timezone', '现在时间', '当前时间', '时区'],
		requiredArgsSummary: ['timezone'],
	},
	convert_time: {
		familyId: 'builtin.time',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '把一个时间从源时区换算到目标时区。',
		capabilityTags: ['convert', 'timezone convert', 'time conversion', '时区转换', '时间换算'],
		requiredArgsSummary: ['source_timezone', 'target_timezone', 'time'],
	},
	calculate_time_range: {
		familyId: 'builtin.time',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '把自然语言时间表达解析为时间范围。',
		capabilityTags: ['range', 'time range', 'natural time', '昨天', '上周', '时间范围'],
		requiredArgsSummary: ['natural_time', 'timezone'],
	},
	get_first_link_path: {
		familyId: 'builtin.vault.discovery',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '把内部链接解析成真实文件路径。',
		capabilityTags: ['link', 'path', 'wiki link', '内部链接', '路径'],
		requiredArgsSummary: ['link'],
	},
	read_file: {
		familyId: 'builtin.vault.read',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '读取单个已知文件的文本内容。',
		whenNotToUse: ['不知道路径时先用 find_paths'],
		capabilityTags: ['read', 'file', 'content', 'lines', '读取文件', '查看内容'],
		requiredArgsSummary: ['file_path'],
		runtimePolicy: {
			defaultArgs: { response_format: 'json' },
			hiddenSchemaFields: ['response_format'],
			contextDefaults: [
				{ field: 'file_path', source: 'selected-text-file-path' },
				{ field: 'file_path', source: 'active-file-path' },
				{ field: 'start_line', source: 'selected-text-start-line' },
				{ field: 'line_count', source: 'selected-text-line-count' },
			],
		},
	},
	read_media: {
		familyId: 'builtin.vault.read',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '读取已知图片或音频文件。',
		capabilityTags: ['image', 'audio', 'media', '图片', '音频', '媒体'],
		requiredArgsSummary: ['file_path'],
		runtimePolicy: {
			contextDefaults: [
				{ field: 'file_path', source: 'selected-text-file-path' },
				{ field: 'file_path', source: 'active-file-path' },
			],
		},
	},
	read_files: {
		familyId: 'builtin.vault.read',
		source: 'builtin',
		visibility: 'candidate-only',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '批量读取多个已知文件。',
		capabilityTags: ['batch', 'multiple files', '多个文件', '批量'],
		requiredArgsSummary: ['file_paths'],
		runtimePolicy: {
			defaultArgs: { response_format: 'json' },
			hiddenSchemaFields: ['response_format'],
		},
	},
	write_file: {
		familyId: 'builtin.vault.write',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'low',
		riskLevel: 'mutating',
		oneLinePurpose: '创建文件或整体覆盖文本内容。',
		capabilityTags: ['write', 'create file', 'overwrite', '写入文件', '新建文件'],
		requiredArgsSummary: ['file_path', 'content'],
	},
	edit_file: {
		familyId: 'builtin.vault.write',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'mutating',
		oneLinePurpose: '对已知文件做最小局部编辑。',
		whenToUse: ['只修改当前一段或少量已知片段', '希望保留文件其余内容不变'],
		whenNotToUse: ['需要整文件重写时用 write_file', '片段定位不唯一时先用 read_file 读取目标范围'],
		capabilityTags: ['edit', 'patch', 'modify', '局部修改', '编辑文件'],
		requiredArgsSummary: ['file_path', 'edits'],
		runtimePolicy: {
			contextDefaults: [
				{ field: 'file_path', source: 'selected-text-file-path' },
				{ field: 'file_path', source: 'active-file-path' },
			],
		},
	},
	create_directory: {
		familyId: 'builtin.vault.write',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'low',
		riskLevel: 'mutating',
		oneLinePurpose: '创建目录。',
		capabilityTags: ['directory', 'folder', 'mkdir', '创建目录', '新建文件夹'],
		requiredArgsSummary: ['directory_path'],
	},
	list_directory: {
		familyId: 'builtin.vault.discovery',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'high',
		riskLevel: 'read-only',
		oneLinePurpose: '兼容型目录浏览工具；默认优先使用 list_directory_flat、list_directory_tree 或 list_vault_overview。',
		whenNotToUse: ['不知道目录路径时先用 find_paths'],
		capabilityTags: ['directory', 'folder', 'tree', 'list', '目录', '树形'],
		requiredArgsSummary: ['directory_path', 'view'],
		runtimePolicy: {
			defaultArgs: { response_format: 'json' },
			hiddenSchemaFields: ['response_format'],
		},
		compatibility: {
			deprecationStatus: 'legacy',
		},
	},
	list_directory_flat: {
		familyId: 'builtin.vault.discovery',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '浏览已知目录的一层内容。',
		whenNotToUse: ['需要树形递归时用 list_directory_tree', '需要全库总览时用 list_vault_overview'],
		capabilityTags: ['directory', 'folder', 'flat list', '目录浏览', '当前目录'],
		requiredArgsSummary: ['directory_path'],
	},
	list_directory_tree: {
		familyId: 'builtin.vault.discovery',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '以树形方式递归浏览已知目录。',
		whenNotToUse: ['只看当前目录一层时用 list_directory_flat', '需要全库概览时用 list_vault_overview'],
		capabilityTags: ['directory tree', 'tree', 'recursive directory', '树形目录', '递归目录'],
		requiredArgsSummary: ['directory_path'],
	},
	list_vault_overview: {
		familyId: 'builtin.vault.discovery',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '获取整个 Vault 的轻量文件路径总览。',
		whenNotToUse: ['只浏览单个目录时用 list_directory_flat', '需要目录树时用 list_directory_tree'],
		capabilityTags: ['vault overview', 'vault', 'workspace overview', '全库总览', 'Vault 总览'],
		requiredArgsSummary: ['file_extensions'],
	},
	move_path: {
		familyId: 'builtin.vault.write',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'low',
		riskLevel: 'mutating',
		oneLinePurpose: '移动或重命名文件、目录。',
		capabilityTags: ['move', 'rename', '移动', '重命名'],
		requiredArgsSummary: ['source_path', 'destination_path'],
	},
	find_paths: {
		familyId: 'builtin.vault.discovery',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '按名称或路径片段查找文件和目录。',
		capabilityTags: ['find', 'path', 'locate', '文件名', '路径搜索', '查找'],
		requiredArgsSummary: ['query'],
		runtimePolicy: {
			defaultArgs: { response_format: 'json' },
			hiddenSchemaFields: ['response_format'],
		},
	},
	delete_path: {
		familyId: 'builtin.vault.write',
		source: 'workflow',
		visibility: 'workflow-only',
		argumentComplexity: 'medium',
		riskLevel: 'destructive',
		oneLinePurpose: '删除文件或目录。',
		capabilityTags: ['delete', 'remove', '删除', '移除'],
		requiredArgsSummary: ['target_path'],
	},
	search_content: {
		familyId: 'builtin.vault.search',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'high',
		riskLevel: 'read-only',
		oneLinePurpose: '在文件正文中搜索文本或正则。',
		capabilityTags: ['search', 'content', 'regex', 'grep', '正文搜索', '内容搜索'],
		requiredArgsSummary: ['pattern'],
		runtimePolicy: {
			defaultArgs: { response_format: 'json' },
			hiddenSchemaFields: ['response_format'],
		},
	},
	query_index: {
		familyId: 'builtin.vault.search',
		source: 'builtin',
		visibility: 'candidate-only',
		argumentComplexity: 'high',
		riskLevel: 'read-only',
		oneLinePurpose: '查询 Vault 的结构化索引、标签和任务数据。',
		capabilityTags: ['index', 'metadata', 'tag', 'tags', 'task', 'tasks', 'property', 'frontmatter'],
		requiredArgsSummary: ['data_source', 'query'],
		runtimePolicy: {
			defaultArgs: { response_format: 'json' },
			hiddenSchemaFields: ['response_format'],
		},
	},
	stat_path: {
		familyId: 'builtin.vault.discovery',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '读取文件或目录的元数据。',
		capabilityTags: ['stat', 'metadata', 'info', '属性', '元数据'],
		requiredArgsSummary: ['target_path'],
		runtimePolicy: {
			defaultArgs: { response_format: 'json' },
			hiddenSchemaFields: ['response_format'],
			contextDefaults: [
				{ field: 'target_path', source: 'selected-text-file-path' },
				{ field: 'target_path', source: 'active-file-path' },
			],
		},
		compatibility: {
			legacyCallNames: ['get_file_info'],
		},
	},
	open_file: {
		familyId: 'builtin.vault.read',
		source: 'builtin',
		visibility: 'candidate-only',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '在 Obsidian 中打开已知文件。',
		capabilityTags: ['open', 'file', 'panel', '打开文件'],
		requiredArgsSummary: ['file_path'],
		runtimePolicy: {
			contextDefaults: [
				{ field: 'file_path', source: 'selected-text-file-path' },
				{ field: 'file_path', source: 'active-file-path' },
			],
		},
	},
	fetch: {
		familyId: 'builtin.web.fetch',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'high',
		riskLevel: 'read-only',
		oneLinePurpose: '兼容型网页抓取工具；默认优先使用 fetch_webpage 或 fetch_webpages_batch。',
		capabilityTags: ['fetch', 'url', 'website', 'webpage', '抓取网页', '网页内容'],
		requiredArgsSummary: ['url 或 urls'],
		compatibility: {
			deprecationStatus: 'legacy',
		},
	},
	fetch_webpage: {
		familyId: 'builtin.web.fetch',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '抓取单个已知网页。',
		capabilityTags: ['fetch', 'webpage', 'url', 'http', '抓取网页', '网页正文'],
		requiredArgsSummary: ['url'],
	},
	fetch_webpages_batch: {
		familyId: 'builtin.web.fetch',
		source: 'builtin',
		visibility: 'candidate-only',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '批量抓取多个已知网页。',
		capabilityTags: ['batch fetch', 'multiple urls', 'batch', '批量抓取', '多个网页'],
		requiredArgsSummary: ['urls'],
	},
	bing_search: {
		familyId: 'builtin.web.search',
		source: 'builtin',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: '搜索网络内容。',
		capabilityTags: ['web search', 'search web', 'internet', '搜索网络', '联网搜索'],
		requiredArgsSummary: ['query'],
	},
	[DISCOVER_SKILLS_TOOL_NAME]: {
		familyId: 'builtin.skill.discovery',
		source: 'builtin',
		visibility: 'candidate-only',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '列出当前可用的 Skill。',
		capabilityTags: ['skill', 'skills', 'discover skills', '技能', '可用技能'],
		requiredArgsSummary: ['query'],
	},
	[INVOKE_SKILL_TOOL_NAME]: {
		familyId: 'workflow.skill',
		source: 'workflow',
		visibility: 'workflow-only',
		argumentComplexity: 'high',
		riskLevel: 'mutating',
		oneLinePurpose: '加载并执行复杂 Skill 工作流。',
		capabilityTags: ['skill', 'workflow', '技能'],
	},
	[DISCOVER_SUB_AGENTS_TOOL_NAME]: {
		familyId: 'builtin.delegate.discovery',
		source: 'custom',
		visibility: 'candidate-only',
		argumentComplexity: 'low',
		riskLevel: 'read-only',
		oneLinePurpose: '列出当前可用的 Sub-Agent。',
		capabilityTags: ['sub-agent', 'delegate', 'discover agents', '子代理', '委托代理'],
		requiredArgsSummary: ['query'],
	},
	[DELEGATE_SUB_AGENT_TOOL_NAME]: {
		familyId: 'workflow.delegate',
		source: 'workflow',
		visibility: 'workflow-only',
		argumentComplexity: 'high',
		riskLevel: 'mutating',
		oneLinePurpose: '把任务委托给指定的 Sub-Agent。',
		capabilityTags: ['sub-agent', 'delegate', '委托', '子代理'],
		requiredArgsSummary: ['agent', 'task'],
	},
};

export const createFallbackBlueprint = (
	tool: Pick<ToolDefinition, 'name' | 'description' | 'source' | 'sourceId'>,
): SurfaceBlueprint => {
	if (tool.name.startsWith(SUB_AGENT_TOOL_PREFIX)) {
		return {
			familyId: 'workflow.delegate',
			source: 'workflow',
			visibility: 'hidden',
			argumentComplexity: 'high',
			riskLevel: 'mutating',
			oneLinePurpose: '把任务委托给子代理处理。',
			capabilityTags: ['sub-agent', 'delegate', '委托', '子代理'],
			compatibility: {
				deprecationStatus: 'legacy',
			},
		};
	}

	if (tool.source === 'mcp') {
		const nameTokens = tool.name
			.toLowerCase()
			.split(/[^a-z0-9]+/u)
			.filter((token) => token.length > 1);
		return {
			familyId: `mcp.${tool.sourceId}`,
			source: 'mcp',
			visibility: 'default',
			argumentComplexity: 'medium',
			riskLevel: 'read-only',
			oneLinePurpose: summarizeDescriptionForUiFallback(tool.description),
			capabilityTags: [tool.sourceId.toLowerCase(), ...nameTokens],
		};
	}

	return {
		familyId: 'builtin.misc',
		source: 'custom',
		visibility: 'default',
		argumentComplexity: 'medium',
		riskLevel: 'read-only',
		oneLinePurpose: summarizeDescriptionForUiFallback(tool.description),
		capabilityTags: [],
	};
};
