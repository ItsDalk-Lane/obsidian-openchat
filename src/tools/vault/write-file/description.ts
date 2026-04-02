export const WRITE_FILE_DESCRIPTION = `创建一个文本文件，或用新的完整内容覆盖已有文本文件。

## 何时使用

- 需要整文件写入内容时
- 需要创建新文本文件时
- 需要完全替换旧文件内容时

## 何时不使用

- **不要用于局部修改现有文件**：局部替换请使用 \`edit_file\`
- **不要用于查找路径**：只知道名称时先用 \`find_paths\`

## 可用字段

- **file_path**（必需）：目标文件路径，相对于 Vault 根目录
- **content**（必需）：要写入的完整文本内容

## 返回值

返回 \`file_path\`、\`action\` 和 \`bytes_written\`，分别表示目标路径、是创建还是更新，以及写入字节数。

## 失败恢复

- 如果父目录不存在，先调用 \`create_directory\` 或改正路径
- 如果目标是目录而不是文件，改用正确的文件路径

## 示例

\`\`\`json
{
  "file_path": "drafts/report.md",
  "content": "# Report\\n\\nInitial draft"
}
\`\`\``;
