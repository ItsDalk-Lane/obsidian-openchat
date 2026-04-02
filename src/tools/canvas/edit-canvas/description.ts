export const EDIT_CANVAS_DESCRIPTION = `结构化修改指定 Obsidian Canvas 文件。

## 何时使用

- 需要增删 Canvas 节点时
- 需要调整节点位置、尺寸或文本内容时
- 需要新增、更新或删除节点之间的连线时

## 何时不使用

- **不要用于读取 Canvas**：只读理解请改用 \`read_canvas\`
- **不要用于普通 Markdown 编辑**：正文文件请改用文件工具
- **不要直接手写原始 JSON 补丁**：请通过结构化 \`operations\` 表达意图

## 可用字段

- **file_path**（必需）：目标 \`.canvas\` 文件路径
- **operations**（必需）：Canvas 结构化编辑操作列表

支持的操作：

- \`add_node\`
- \`update_node\`
- \`move_node\`
- \`remove_node\`
- \`add_edge\`
- \`update_edge\`
- \`remove_edge\`

## 返回值

返回本次应用后的：

- 变更过的节点/连线 id
- 删除的节点/连线 id
- 当前节点数和连线数
- 简要 diff 预览

## 失败恢复

- 如果不知道目标节点或连线 id，先用 \`read_canvas\`
- 如果删除节点时仍有关联连线，可开启 \`remove_connected_edges\` 或先删连线
- 如果只是想移动节点，不要使用更重的 \`update_node\` 文本补丁

## 示例

\`\`\`json
{
  "file_path": "boards/project.canvas",
  "operations": [
    {
      "action": "move_node",
      "node_id": "intro",
      "x": 320,
      "y": 180
    }
  ]
}
\`\`\``
