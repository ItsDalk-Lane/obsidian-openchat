export const BACKLINK_ANALYZE_DESCRIPTION = `分析指定笔记的一跳链接关系。

## 何时使用

- 需要理解某篇笔记被哪些笔记引用时
- 需要查看该笔记的出链、双向链接或未解析链接时
- 需要利用 Obsidian 图谱关系来理解上下文时

## 何时不使用

- **不要用于正文搜索**：正文关键词检索请使用 \`search_content\`
- **不要用于修改笔记**：这是只读分析工具，不会改文件
- **不要用于未知路径猜测**：请先用 \`find_paths\` 或其他发现工具定位目标笔记

## 可用字段

- **file_path**（必需）：目标 Markdown 笔记路径
- **include_outgoing**（可选，默认 true）：是否返回出链详情
- **include_unresolved**（可选，默认 false）：是否返回未解析链接
- **depth**（可选，默认 1）：当前阶段只支持一跳分析

## 返回值

返回 \`incoming\`、\`outgoing\`、\`mutual\` 和可选的 \`unresolved\`，
用于理解目标笔记的一跳邻居关系。

## 失败恢复

- 如果文件不是 Markdown 笔记，改用笔记文件路径
- 如果只是想读取正文，不要继续重试当前工具，应改用 \`read_file\`
- 如果需要更深层图分析，当前阶段不要把 \`depth\` 调到 2

## 示例

\`\`\`json
{
  "file_path": "notes/project.md",
  "include_outgoing": true,
  "include_unresolved": true,
  "depth": 1
}
\`\`\``;
