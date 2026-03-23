import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { App } from 'obsidian';
import { z } from 'zod';
import { registerBuiltinTool } from '../runtime/register-tool';
import { BuiltinToolRegistry } from '../runtime/tool-registry';
import type { BuiltinTool } from '../runtime/types';
import { assertVaultPath, getFileOrThrow, normalizeVaultPath } from './helpers';

const openFileSchema = z.object({
	file_path: z
		.string()
		.min(1)
		.describe('已知文件路径；相对于 Vault 根目录。仅在已经知道准确文件路径时使用'),
	open_in_new_panel: z
		.boolean()
		.default(false)
		.optional()
		.describe('是否在新的编辑面板中打开文件，默认 false'),
}).strict();

const openFileResultSchema = z.object({
	file_path: z.string(),
	open_in_new_panel: z.boolean(),
	opened: z.boolean(),
});

export function createNavTools(): BuiltinTool[] {
	return [{
		name: 'open_file',
			title: '在 Obsidian 中打开文件',
			description: `在 Obsidian 中打开一个已知路径的文件，使其在编辑器中可见。

## 何时使用

- 已经知道文件的准确路径，需要把它展示给用户时
- 需要把当前编辑器切换到指定文件时

## 何时不使用

- **不要用于查找未知路径**：如果只知道文件名称，请先使用 \`find_paths\`
- **不要用于读取文件内容**：读取内容请使用 \`read_file\`
- **不要用于创建文件**：创建新文件请使用 \`write_file\`

## 可用字段

- **file_path**（必需）：文件路径，相对于 Vault 根目录，必须是已知准确路径
- **open_in_new_panel**（可选，默认 false）：是否在新的编辑面板中打开文件

## 返回值

返回 \`file_path\`、\`open_in_new_panel\` 和 \`opened\`，分别表示实际打开路径、是否新面板以及是否成功打开。

## 失败恢复

- 如果报路径不存在，先调用 \`find_paths\` 定位准确路径
- 如果路径格式错误，确认传入的是相对于 Vault 根目录的路径`,
			inputSchema: openFileSchema,
			outputSchema: openFileResultSchema,
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		async execute({ file_path, open_in_new_panel = false }, context) {
			const normalizedPath = normalizeVaultPath(file_path);
			assertVaultPath(normalizedPath, 'file_path');
			const file = getFileOrThrow(context.app, normalizedPath);
			const leaf = context.app.workspace.getLeaf(open_in_new_panel);
			await leaf.openFile(file);
			return {
				file_path: normalizedPath,
				open_in_new_panel,
				opened: true,
			};
		},
	}];
}

export function registerNavTools(
	server: McpServer,
	app: App,
	registry: BuiltinToolRegistry
): void {
	const [tool] = createNavTools();
	registerBuiltinTool(
		server,
		registry,
		tool.name,
		{
			title: tool.title,
			description: tool.description,
			inputSchema: tool.inputSchema,
			outputSchema: tool.outputSchema,
			annotations: tool.annotations,
		},
		async (args) => await tool.execute(args, {
			app,
			callTool: async () => {
				throw new Error('open_file 不支持在旧 runtime 中跨工具调用');
			},
		})
	);
}
