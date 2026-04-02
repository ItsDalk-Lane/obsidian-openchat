export const LIST_DIRECTORY_FLAT_DESCRIPTION = `浏览一个已知目录的一层内容。

## 何时使用

- 已经知道准确目录路径，只想查看当前目录一层的文件和子目录时
- 需要按名称、大小或正则过滤结果时

## 何时不使用

- **不要用于递归目录树**：需要树形递归时请使用 \`list_directory_tree\`
- **不要用于全库总览**：需要整个 Vault 的轻量路径视图时请使用 \`list_vault_overview\`
- **不要用于定位未知路径**：只知道名称时请先使用 \`find_paths\`

## 可用字段

- **directory_path**（可选，默认 \`/\`）：目录路径，相对于 Vault 根目录
- **include_sizes**（可选，默认 false）：是否返回文件大小与目录汇总
- **sort_by**（可选，默认 \`name\`）：按名称或大小排序
- **regex**（可选）：按名称过滤目录项的 JavaScript 正则表达式
- **limit**（可选，默认 100）：每页最多返回多少个目录项
- **offset**（可选，默认 0）：分页偏移量

## 返回值

返回 \`items\` 和 \`meta\`；当 \`include_sizes=true\` 时，还会返回 \`summary\`。
`;
