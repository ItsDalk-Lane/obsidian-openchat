export const EDIT_FILE_DESCRIPTION = `按文本片段编辑一个已知路径的文本文件，并支持 dry run 预览 diff。

## 何时使用

- 已经知道准确文件路径，只需要局部修改时
- 想先预览 diff 再决定是否写入时
- 用户说“修改这段”“改这里”“只改这一小段”这类局部编辑意图时

## 何时不使用

- **不要用于整文件重写**：整文件写入请使用 \`write_file\`
- **不要用于发现路径或浏览目录**：
  请改用 \`find_paths\`、\`list_directory_flat\`、\`list_directory_tree\`
  或 \`list_vault_overview\`

## 可用字段

- **file_path**（必需）：目标文本文件路径
- **edits**（必需）：编辑操作数组，每项包含 \`oldText\` 和 \`newText\`
- **dry_run**（可选，默认 false）：是否只返回 diff 预览而不写入

## 返回值

返回 \`file_path\`、\`dry_run\`、\`applied_edits\`、\`updated\` 和 \`diff\`。

## 默认编辑策略

- 默认只做最小必要替换，不要顺手重写整文件
- 如果当前轮已经给了选中文本或局部片段，优先围绕这段构造最小修改
- \`oldText\` 应尽量使用能唯一定位的最小连续文本，不要用过大的整段内容
- 如果需要多个 edits，只有在多个独立位置都必须修改时才拆分；不要把相邻修改拆得过细
- 如果定位不稳或不确定片段边界，先用 \`read_file\` 读取目标范围，再提交更小、更稳的 \`edits\`

## 失败恢复

- 如果提示找不到待替换文本，先用 \`read_file\` 读取目标片段再重试
- 如果只想查看改动效果，先把 \`dry_run\` 设为 \`true\`

## 示例

\`\`\`json
{
  "file_path": "notes/todo.md",
  "edits": [
    {
      "oldText": "- [ ] old item",
      "newText": "- [x] old item"
    }
  ],
  "dry_run": true
}
\`\`\``;
