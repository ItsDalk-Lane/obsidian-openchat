export const LIST_COMMANDS_DESCRIPTION = `列出当前 Obsidian 可执行命令。

## 何时使用

- 需要先发现可用命令，再决定执行哪个命令时
- 需要按关键词或插件来源筛选命令时

## 何时不使用

- **不要用于直接执行命令**：执行已知命令请使用 \`run_command\`
- **不要用于文件内容检索**：正文搜索请使用 Vault 或 Web 工具

## 可用字段

- **query**（可选）：按命令名称或命令 id 模糊筛选
- **plugin_id**（可选）：按命令来源插件筛选
- **max_results**（可选，默认 50）：最大返回条数

## 返回值

返回 \`commands\` 数组。每个元素包含：

- \`id\`
- \`name\`
- \`plugin\`

## 失败恢复

- 如果结果太多，补充 \`query\` 或 \`plugin_id\`
- 如果已经知道命令 id，不要继续重试当前工具，应改用 \`run_command\`

## 示例

\`\`\`json
{
  "query": "command palette",
  "max_results": 20
}
\`\`\``;
