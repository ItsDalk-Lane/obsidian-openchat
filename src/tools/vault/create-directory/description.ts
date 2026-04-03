export const CREATE_DIRECTORY_DESCRIPTION = `创建一个已知路径的目录，必要时递归创建缺失的父目录。

## 何时使用

- 需要为后续写文件或移动文件提前准备目录时
- 需要整理 Vault 目录结构时

## 何时不使用

- **不要用于浏览目录内容**：请使用 \`list_directory_flat\`、\`list_directory_tree\` 或 \`list_vault_overview\`
- **不要用于查找未知目录路径**：请先使用 \`find_paths\`

## 返回值

返回 \`directory_path\`、\`created\` 和 \`existed\`。

## 失败恢复

- 如果目录路径不合法，修正 \`directory_path\`
- 如果只是想查看目录内容，不要重试当前工具，应改用 \`list_directory_flat\``;