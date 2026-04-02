export const LIST_VAULT_OVERVIEW_DESCRIPTION = `获取整个 Vault 的轻量文件路径总览。

## 何时使用

- 需要从全局视角快速了解 Vault 中文件分布时
- 需要先做全库级候选规划，再决定进入哪个目录或文件时

## 何时不使用

- **不要用于浏览单个已知目录**：请使用 \`list_directory_flat\` 或
  \`list_directory_tree\`
- **不要用于定位单个未知目标**：只知道名称时请先使用 \`find_paths\`
`;
