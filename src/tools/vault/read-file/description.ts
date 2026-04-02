export const READ_FILE_DESCRIPTION = `读取一个已知路径的文本文件，支持整篇读取、分段读取、读取开头和读取结尾。

## 何时使用

- 已经知道准确文件路径，并且需要读取正文内容时
- 需要分页阅读长文本文件时
- 需要先查看开头或结尾片段再决定下一步时

## 何时不使用

- **不要用于发现未知路径**：只知道名称时先用 \`find_paths\`
- **不要用于浏览目录结构**：目录浏览请使用 \`list_directory_flat\`、\`list_directory_tree\` 或 \`list_vault_overview\`
- **不要用于正文搜索定位**：按内容搜索请使用 \`search_content\`

## 可用字段

- **file_path**（必需）：要读取的文本文件路径，相对于 Vault 根目录
- **read_mode**（可选，默认 \`segment\`）：\`full\`、\`segment\`、\`head\`、\`tail\`
- **start_line**（可选）：仅 \`segment\` 模式可用，从第几行开始读取，第一行为 1
- **line_count**（可选）：\`segment\`、\`head\`、\`tail\` 模式返回的行数
- **response_format**（可选，默认 \`json\`）：返回 \`json\` 或 \`text\`

## 参数规则

- \`start_line\` 只能在 \`segment\` 模式下使用
- 长文默认优先使用 \`segment\`，不要一开始就使用 \`full\`
- 当返回 \`has_more=true\` 时，可用 \`next_start_line\` 继续读取后续片段

## 返回值

返回 \`file_path\`、\`read_mode\`、\`content\`、\`total_lines\`、
\`returned_start_line\`、\`returned_end_line\`、\`has_more\`、\`next_start_line\`、
\`truncated\`，以及可能出现的 \`warning\` 和 \`suggested_next_call\`。

## 失败恢复

- 如果 \`full\` 模式提示文件过长，改用 \`segment\`
- 如果路径不存在，先用 \`find_paths\` 定位准确路径
- 如果还有剩余内容，按 \`suggested_next_call\` 或 \`next_start_line\` 继续读取

## 示例

\`\`\`json
{
  "file_path": "notes/todo.md",
  "read_mode": "segment",
  "start_line": 1,
  "line_count": 120
}
\`\`\``;
