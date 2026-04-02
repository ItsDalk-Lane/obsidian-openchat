export const READ_CANVAS_DESCRIPTION = `读取指定 Obsidian Canvas 文件的节点、连线与布局摘要。

## 何时使用

- 需要理解某个 \`.canvas\` 文件的节点结构和连线关系时
- 需要先读 Canvas，再决定是否进行结构化修改时
- 需要把 Canvas 当作布局化知识图读取，而不是当普通文本文件处理时

## 何时不使用

- **不要用于修改 Canvas**：写入请改用 \`edit_canvas\`
- **不要用于 Markdown 正文读取**：普通笔记请改用 \`read_file\`
- **不要用于未知路径猜测**：不知道 Canvas 路径时请先用 \`find_paths\`

## 可用字段

- **file_path**（必需）：目标 \`.canvas\` 文件路径
- **text_preview_length**（可选，默认 120）：文本节点预览长度

## 返回值

返回：

- \`summary\`：节点/连线数量、节点类型分布、整体 bounds
- \`nodes\`：节点位置、尺寸、标签和文本预览
- \`edges\`：连线关系与方向

## 失败恢复

- 如果路径不是 \`.canvas\` 文件，请改用正确的 Canvas 路径
- 如果只想改 Canvas，不要重复读取，应改用 \`edit_canvas\`
- 如果只是想看文件原始 JSON，不建议走当前工具，应使用更底层的文件读取工具

## 示例

\`\`\`json
{
  "file_path": "boards/project.canvas",
  "text_preview_length": 160
}
\`\`\``
