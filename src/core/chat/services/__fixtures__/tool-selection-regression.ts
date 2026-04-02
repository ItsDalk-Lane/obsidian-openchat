import type { ToolSurfaceSettings } from 'src/domains/settings/types-ai-runtime';

export interface ToolSelectionRegressionCase {
	readonly name: string;
	readonly prompt: string;
	readonly expectedMode: 'atomic-tools' | 'workflow';
	readonly expectedToolNames: readonly string[];
	readonly excludedToolNames?: readonly string[];
	readonly activeFilePath?: string;
	readonly toolSurface?: ToolSurfaceSettings;
}

export const TOOL_SELECTION_REGRESSION_CASES: readonly ToolSelectionRegressionCase[] = [
	{
		name: '已知文件读取走原子读取工具',
		prompt: '请读取当前文件并总结代码逻辑',
		expectedMode: 'atomic-tools',
		expectedToolNames: ['read_file'],
		excludedToolNames: ['run_shell'],
		activeFilePath: 'docs/current-note.md',
	},
	{
		name: '显式 shell 意图进入 workflow 面',
		prompt: '请在终端里执行一个 shell 命令列出目录',
		expectedMode: 'workflow',
		expectedToolNames: ['run_shell'],
		excludedToolNames: ['read_file'],
	},
	{
		name: '显式 run_script 意图进入 workflow 面',
		prompt: '请使用 run_script 编排读取和总结当前文件的流程',
		expectedMode: 'workflow',
		expectedToolNames: ['run_script'],
		excludedToolNames: ['read_file'],
	},
	{
		name: '时区换算优先使用时间 wrapper',
		prompt: '请把 Asia/Shanghai 的 09:30 转换到 Europe/London 时间',
		expectedMode: 'atomic-tools',
		expectedToolNames: ['convert_time'],
		excludedToolNames: ['get_time'],
	},
	{
		name: '单网页抓取优先使用 fetch wrapper',
		prompt: '请抓取 https://example.com/article 这个网页的正文内容',
		expectedMode: 'atomic-tools',
		expectedToolNames: ['fetch_webpage'],
		excludedToolNames: ['fetch'],
	},
	{
		name: '单层目录浏览优先使用 flat wrapper',
		prompt: '请列出 projects 目录当前一层的内容',
		expectedMode: 'atomic-tools',
		expectedToolNames: ['list_directory_flat'],
		excludedToolNames: ['list_directory_tree', 'list_vault_overview', 'list_directory'],
	},
	{
		name: 'Vault 总览优先使用 overview wrapper',
		prompt: '请给我整个 vault 的文件路径总览，只看 md 文件',
		expectedMode: 'atomic-tools',
		expectedToolNames: ['list_vault_overview'],
		excludedToolNames: ['list_directory'],
	},
	{
		name: '树形目录浏览优先使用 tree wrapper',
		prompt: '请递归列出 src 目录的树形结构',
		expectedMode: 'atomic-tools',
		expectedToolNames: ['list_directory_tree'],
		excludedToolNames: ['list_directory'],
	},
	{
		name: '联网查询优先使用 web search 工具',
		prompt: '请联网搜索 Obsidian 插件 tool calling 的最佳实践',
		expectedMode: 'atomic-tools',
		expectedToolNames: ['bing_search'],
		excludedToolNames: ['run_shell'],
	},
	{
		name: '正文搜索优先选择 search_content',
		prompt: '请在仓库里搜索 TODO 这个文本',
		expectedMode: 'atomic-tools',
		expectedToolNames: ['search_content'],
		excludedToolNames: ['run_shell'],
	},
	{
		name: '标签与任务查询会把 query_index 纳入候选',
		prompt: '请查询 vault 里带 project 标签的任务项',
		expectedMode: 'atomic-tools',
		expectedToolNames: ['query_index'],
		excludedToolNames: ['run_shell'],
	},
	{
		name: '批量网页抓取优先纳入 batch wrapper',
		prompt: '请批量抓取这几个网页的正文内容',
		expectedMode: 'atomic-tools',
		expectedToolNames: ['fetch_webpages_batch'],
		excludedToolNames: ['fetch'],
	},
	{
		name: '显式 skill 意图进入 workflow 面',
		prompt: '请使用 skill code-audit 检查当前项目的规范问题',
		expectedMode: 'workflow',
		expectedToolNames: ['invoke_skill'],
		excludedToolNames: ['read_file'],
	},
	{
		name: '显式计划维护进入 workflow 面',
		prompt: '请更新任务计划并补一条待办事项',
		expectedMode: 'workflow',
		expectedToolNames: ['write_plan'],
		excludedToolNames: ['read_file'],
	},
	{
		name: '运行时说明不应误入 shell workflow',
		prompt: '请总结 Obsidian 的运行时架构设计',
		expectedMode: 'atomic-tools',
		expectedToolNames: ['find_paths'],
		excludedToolNames: ['run_shell'],
	},
	{
		name: 'skills 文档说明不应误入 Skill workflow',
		prompt: '请读取 skills.md 文件的使用说明并总结要点',
		expectedMode: 'atomic-tools',
		expectedToolNames: ['read_file'],
		excludedToolNames: ['invoke_skill'],
	},
	{
		name: '文件名包含 run_shell 时不应误入 workflow',
		prompt: '请读取 run_shell.ts 文件的内容并解释实现逻辑',
		expectedMode: 'atomic-tools',
		expectedToolNames: ['read_file'],
		excludedToolNames: ['run_shell'],
	},
];
