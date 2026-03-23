import { z } from 'zod';
import type { BuiltinTool } from '../runtime/types';

const getFirstLinkPathSchema = z.object({
	internal_link: z
		.string()
		.min(1)
		.describe('要解析的 Obsidian 内部链接文本。可以传页面名，也可以误带 [[]]、别名或标题；工具会先做清理再查找对应文件路径。'),
}).strict();

const getFirstLinkPathResultSchema = z.object({
	file_path: z.string().describe('解析后的文件路径（相对于 Vault 根目录）'),
	found: z.boolean().describe('是否找到文件'),
});

/**
 * 清理内部链接文本
 * - 移除可能存在的方括号 [[ 和 ]]
 * - 移除别名部分（| 后面的内容）
 * - 移除标题部分（# 后面的内容）
 */
function cleanLinkText(linkText: string): string {
	let cleaned = linkText.trim();

	// 移除方括号
	if (cleaned.startsWith('[[') && cleaned.endsWith(']]')) {
		cleaned = cleaned.slice(2, -2);
	} else if (cleaned.startsWith('[[')) {
		cleaned = cleaned.slice(2);
	} else if (cleaned.endsWith(']]')) {
		cleaned = cleaned.slice(0, -2);
	}

	// 移除别名部分（| 后面的内容）
	const pipeIndex = cleaned.indexOf('|');
	if (pipeIndex !== -1) {
		cleaned = cleaned.slice(0, pipeIndex);
	}

	// 移除标题部分（# 后面的内容）
	const hashIndex = cleaned.indexOf('#');
	if (hashIndex !== -1) {
		cleaned = cleaned.slice(0, hashIndex);
	}

	return cleaned.trim();
}

export function createLinkTools(): BuiltinTool[] {
	return [{
		name: 'get_first_link_path',
			title: '解析内部链接获取文件路径',
			description: `解析 Obsidian 内部链接，并返回其在 Vault 中指向的实际文件路径。

## 何时使用

- 需要把用户输入的 wiki 链接解析成真实文件路径时
- 后续要基于链接继续调用 \`read_file\`、\`open_file\` 等工具时

## 何时不使用

- **不要用于直接读取文件内容**：拿到路径后再调用 \`read_file\`
- **不要用于模糊查找未知文件名**：如果只有关键词，请优先使用 \`find_paths\`

## 参数规则

- \`internal_link\` 传链接文本即可，允许包含 \`[[...]]\`
- 如果包含别名（如 \`Page Name|alias\`），工具会自动忽略别名部分
- 如果包含标题（如 \`Page Name#Heading\`），工具会自动忽略标题部分

## 返回值

返回 \`file_path\` 和 \`found\`。当 \`found=false\` 时，\`file_path\` 为空字符串。

## 失败恢复

- 如果 \`found=false\`，检查链接拼写是否正确
- 如果只是要按名称搜索多个候选路径，改用 \`find_paths\``,
			inputSchema: getFirstLinkPathSchema,
			outputSchema: getFirstLinkPathResultSchema,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		async execute({ internal_link }, context) {
			const cleanedLink = cleanLinkText(internal_link);
			const targetFile = context.app.metadataCache.getFirstLinkpathDest(cleanedLink, '');

			if (targetFile) {
				return {
					file_path: targetFile.path,
					found: true,
				};
			}

			return {
				file_path: '',
					found: false,
				};
		},
	}];
}
