import {
	DISCOVER_SKILLS_TOOL_NAME,
	INVOKE_SKILL_TOOL_NAME,
} from 'src/tools/skill/skill-tools';
import {
	DELEGATE_SUB_AGENT_TOOL_NAME,
	DISCOVER_SUB_AGENTS_TOOL_NAME,
} from 'src/tools/sub-agents/types';
import { isBuiltinServerId } from 'src/tools/runtime/constants';
import type { McpToolInfo } from './types';

const BUILTIN_TOOL_UI_SUMMARIES: Record<string, string> = {
	run_script: '用受限 JavaScript 编排多个工具调用，适合多步逻辑。',
	run_shell: '执行本机 shell 命令，仅适用于桌面端环境。',
	write_plan: '更新当前会话的任务计划、状态和执行结果。',
	get_time: '兼容型时间工具；默认改用 get_current_time、convert_time 或 calculate_time_range。',
	get_current_time: '获取某个时区的当前时间。',
	convert_time: '把一个时间从源时区换算到目标时区。',
	calculate_time_range: '把自然语言时间表达解析为时间范围。',
	get_first_link_path: '把 Obsidian 内部链接解析为实际文件路径。',
	read_file: '读取单个文本文件，支持分段、开头、结尾和整篇读取。',
	read_media: '读取图片或音频文件，并返回媒体内容与类型信息。',
	read_files: '批量预览多个文本文件的部分内容。',
	write_file: '创建文件或用完整内容覆盖已有文本文件。',
	edit_file: '按文本片段局部修改文件，并支持 diff 预览。',
	create_directory: '创建目录，并在需要时补齐父目录。',
	list_directory: '兼容型目录浏览工具；默认改用 list_directory_flat、list_directory_tree 或 list_vault_overview。',
	list_directory_flat: '浏览一个已知目录的一层内容。',
	list_directory_tree: '递归浏览一个已知目录的树形结构。',
	list_vault_overview: '获取整个 Vault 的轻量文件路径总览。',
	move_path: '移动或重命名文件、目录路径。',
	find_paths: '按名称或路径片段查找文件和目录。',
	delete_path: '永久删除文件或目录。',
	search_content: '在文件正文中搜索文本或正则匹配。',
	query_index: '查询 Vault 的结构化索引、标签、属性和任务数据。',
	stat_path: '读取文件或目录的元数据信息。',
	fetch: '兼容型网页抓取工具；默认改用 fetch_webpage 或 fetch_webpages_batch。',
	fetch_webpage: '抓取单个已知网页。',
	fetch_webpages_batch: '批量抓取多个已知网页。',
	bing_search: '使用必应搜索网络内容，返回结构化搜索结果。',
	[DISCOVER_SKILLS_TOOL_NAME]: '列出当前可用的 Skill 工作流；不知道名称时先发现。',
	[INVOKE_SKILL_TOOL_NAME]: '执行已知 Skill；不知道名称时先调用 discover_skills。',
	[DISCOVER_SUB_AGENTS_TOOL_NAME]: '列出当前可用的 Sub-Agent 委托目标。',
	[DELEGATE_SUB_AGENT_TOOL_NAME]: '把任务委托给已知的 Sub-Agent；不知道名称时先调用 discover_sub_agents。',
};

const summarizeDescriptionBlock = (description: string | null | undefined): string => {
	const raw = String(description ?? '').trim();
	if (!raw) {
		return '';
	}

	const firstBlock = raw
		.split(/\n##\s+/u, 1)[0]
		.split(/\n\s*\n/u, 1)[0]
		.trim();

	return firstBlock
		.replace(/`([^`]+)`/gu, '$1')
		.replace(/\*\*([^*]+)\*\*/gu, '$1')
		.replace(/<[^>]+>/gu, ' ')
		.replace(/\s+/gu, ' ')
		.trim();
};

export const summarizeToolDescriptionForUi = (
	tool: Pick<McpToolInfo, 'name' | 'description' | 'serverId'>
): string => {
	if (isBuiltinServerId(tool.serverId)) {
		return BUILTIN_TOOL_UI_SUMMARIES[tool.name]
			?? summarizeDescriptionBlock(tool.description);
	}

	return summarizeDescriptionBlock(tool.description);
};

export const summarizeDescriptionForUiFallback = summarizeDescriptionBlock;
