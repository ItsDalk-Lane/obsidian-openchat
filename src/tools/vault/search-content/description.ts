export const SEARCH_CONTENT_DESCRIPTION = `递归搜索文件正文内容，支持普通文本匹配和正则匹配。

## 何时使用

- 已经明确要在文件正文里找关键词、短语、模式或代码片段时
- 需要带上下文行地查看匹配位置时

## 何时不使用

- **不要用于按文件名查路径**：请使用 \`find_paths\`
- **不要用于读取某个已知文件的完整内容**：请使用 \`read_file\`

## 可用字段

- **pattern**（必需）：要搜索的文本或正则表达式
- **match_mode**（可选，默认 \`literal\`）：\`literal\` 或 \`regex\`
- **scope_path**（可选，默认 \`/\`）：限制搜索范围的目录
- **file_types**（可选）：扩展名过滤列表，例如 \`["md", "ts"]\`
- **max_results**（可选，默认 50）：返回的最大匹配数量
- **case_sensitive**（可选，默认 false）：是否区分大小写
- **context_lines**（可选，默认 0）：返回命中前后的上下文行数
- **response_format**（可选，默认 \`json\`）：返回 \`json\` 或 \`text\`

## 返回值

返回 \`matches\` 和 \`meta\`。其中 \`meta\` 包含 \`scanned_files\`、
\`skipped_files\`、\`returned\`、\`has_more\` 等信息。

## 失败恢复

- 如果结果太多，缩小 \`scope_path\`、降低 \`max_results\` 或增加 \`file_types\` 过滤
- 如果只是想读某个已知文件，不要继续重试此工具，应改用 \`read_file\`

## 示例

\`\`\`json
{
  "pattern": "TODO",
  "match_mode": "literal",
  "scope_path": "notes",
  "file_types": ["md"],
  "context_lines": 2
}
\`\`\``;