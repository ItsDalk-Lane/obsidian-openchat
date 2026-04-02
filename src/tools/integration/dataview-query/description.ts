export const DATAVIEW_QUERY_DESCRIPTION = `执行 Dataview 查询，并返回结构化预览与可选 Markdown 结果。

## 何时使用

- Vault 已安装并启用 Dataview 插件时，需要执行 Dataview 查询
- 需要用 TABLE / LIST / TASK 等 Dataview 语法筛选笔记时
- 需要在不手写 JavaScript 的前提下读取 Dataview 结果时

## 何时不使用

- **不要在未安装 Dataview 时使用**：当前工具属于可选集成，插件缺失时不会暴露
- **不要用于全文检索**：正文关键词搜索请改用 \`search_content\`
- **不要用于修改笔记**：当前工具只读，不会写回 Dataview 结果

## 可用字段

- **query**（必需）：Dataview 查询文本
- **origin_file_path**（可选）：查询上下文文件路径；当查询中使用 \`this\` 或相对链接时建议传入
- **max_rows**（可选，默认 50）：结构化结果最多返回多少行
- **max_cell_length**（可选，默认 200）：单元格预览最大长度
- **markdown_preview_length**（可选，默认 4000）：Markdown 结果最大长度

## 返回值

返回：

- \`result_type\`：Dataview 结果类型，例如 \`table\` / \`list\` / \`task\`
- \`headers\` 与 \`rows\`：稳定的结构化预览
- \`markdown\`：Dataview 的 Markdown 渲染结果；不支持时会省略并在 \`notes\` 说明

## 失败恢复

- 如果工具未暴露，先确认 Dataview 插件已安装并启用
- 如果查询使用了 \`this\` 却没有上下文文件，补传 \`origin_file_path\`
- 如果只是想找文件，不要继续重试 Dataview 语法，应改用发现或搜索工具

## 示例

\`\`\`json
{
  "query": "TABLE file.name, status FROM #project",
  "origin_file_path": "notes/project.md",
  "max_rows": 20
}
\`\`\``
