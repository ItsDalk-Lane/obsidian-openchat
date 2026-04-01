import type { ToolSurfaceSettings } from 'src/domains/settings/types-ai-runtime';

export interface ToolSelectionRegressionCase {
	readonly name: string;
	readonly prompt: string;
	readonly expectedMode: 'atomic-tools' | 'workflow';
	readonly expectedToolNames: readonly string[];
	readonly excludedToolNames?: readonly string[];
	readonly toolSurface?: ToolSurfaceSettings;
}

export const TOOL_SELECTION_REGRESSION_CASES: readonly ToolSelectionRegressionCase[] = [
	{
		name: '已知文件读取走原子读取工具',
		prompt: '请读取当前文件并总结代码逻辑',
		expectedMode: 'atomic-tools',
		expectedToolNames: ['read_file'],
		excludedToolNames: ['run_shell'],
	},
	{
		name: '显式 shell 意图进入 workflow 面',
		prompt: '请在终端里执行一个 shell 命令列出目录',
		expectedMode: 'workflow',
		expectedToolNames: ['run_shell'],
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
		name: 'Vault 总览优先使用 overview wrapper',
		prompt: '请给我整个 vault 的文件路径总览，只看 md 文件',
		expectedMode: 'atomic-tools',
		expectedToolNames: ['list_vault_overview'],
		excludedToolNames: ['list_directory'],
	},
];