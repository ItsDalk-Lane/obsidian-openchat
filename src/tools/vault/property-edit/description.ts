export const PROPERTY_EDIT_DESCRIPTION = `结构化编辑 Markdown frontmatter / Properties。

## 何时使用

- 需要稳定地修改 frontmatter 属性，替代脆弱的 \`edit_file\` 文本替换时
- 需要执行 set、delete、append、remove 这类结构化属性操作时

## 何时不使用

- **不要用于正文编辑**：正文内容修改请使用 \`edit_file\`
- **不要用于未知路径猜测**：请先用 \`find_paths\` 或其他发现工具定位文件

## 可用字段

- **file_path**（必需）：目标 Markdown 文件路径
- **operations**（必需）：属性操作数组
  - \`set\`：设置属性值
  - \`delete\`：删除整个属性
  - \`append\`：向属性数组追加值
  - \`remove\`：从属性数组或标量属性中移除值

## 返回值

返回 \`file_path\`、\`updated_keys\` 和可选的 \`diff_preview\`，
用于确认本次 frontmatter 变更涉及了哪些属性。

## 失败恢复

- 如果文件不是 Markdown，改用笔记文件路径
- 如果只是想改正文，不要继续重试当前工具，应改用 \`edit_file\`
- 如果 frontmatter 已损坏，先修复 YAML 结构后再执行属性编辑

## 示例

\`\`\`json
{
  "file_path": "notes/project.md",
  "operations": [
    { "action": "set", "key": "status", "value": "active" },
    { "action": "append", "key": "tags", "value": "roadmap" }
  ]
}
\`\`\``;
