export const GET_FIRST_LINK_PATH_DESCRIPTION = `解析 Obsidian 内部链接，并返回其在 Vault
中指向的实际文件路径。

## 何时使用

- 需要把用户输入的 wiki 链接解析成真实文件路径时
- 后续要基于链接继续调用 \`read_file\`、\`open_file\` 等工具时

## 何时不使用

- **不要用于直接读取文件内容**：拿到路径后再调用 \`read_file\`
- **不要用于模糊查找未知文件名**：如果只有关键词，请优先使用 \`find_paths\`

## 参数规则

- \`internal_link\` 传链接文本即可，允许包含 \`[[...]]\`
- 如果包含别名（如 \`Page Name|alias\`），工具会自动忽略别名部分
- 如果包含标题（如 \`Page Name#Heading\`），工具会自动忽略标题部分

## 返回值

返回 \`file_path\` 和 \`found\`。当 \`found=false\` 时，\`file_path\` 为空字符串。

## 失败恢复

- 如果 \`found=false\`，检查链接拼写是否正确
- 如果只是要按名称搜索多个候选路径，改用 \`find_paths\``;
