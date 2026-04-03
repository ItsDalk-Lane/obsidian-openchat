export const READ_FILES_DESCRIPTION = `批量预览多个已知文本文件的部分内容，适合快速筛选候选文件。

## 何时使用

- 已经拿到一组准确文件路径，只需要快速预览每个文件的一部分内容时
- 想比较多个文件的开头或某一段内容时

## 何时不使用

- **不要用于完整阅读长文**：单篇长文请改用 \`read_file\`
- **不要用于发现路径**：查找路径请先使用 \`find_paths\`

## 可用字段

- **file_paths**（必需）：文件路径数组，最多 20 个
- **read_mode**（可选，默认 \`segment\`）：\`segment\` 或 \`head\`
- **start_line**（可选）：仅 \`segment\` 模式可用
- **line_count**（可选）：每个文件返回的行数
- **response_format**（可选，默认 \`json\`）：返回 \`json\` 或 \`text\`

## 参数规则

- \`start_line\` 只能在 \`segment\` 模式下使用
- 如果某个文件需要继续深入阅读，应单独对该文件调用 \`read_file\`

## 返回值

返回 \`files\` 数组。每个元素包含 \`file_path\`、\`content\`、
\`returned_start_line\`、\`returned_end_line\`、\`has_more\`、
\`next_start_line\`、\`truncated\` 和 \`error\`。

## 失败恢复

- 如果某个文件返回 \`error\`，检查该路径是否存在
- 如果预览不够，针对目标文件单独调用 \`read_file\`

## 示例

\`\`\`json
{
  "file_paths": ["notes/a.md", "notes/b.md"],
  "read_mode": "head",
  "line_count": 40
}
\`\`\``;