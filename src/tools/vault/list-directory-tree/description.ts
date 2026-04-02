export const LIST_DIRECTORY_TREE_DESCRIPTION = `以树形结构递归浏览一个已知目录。

## 何时使用

- 已经知道准确目录路径，需要递归查看层级结构时
- 需要限制最大深度、节点数或排除特定 glob 模式时

## 何时不使用

- **不要用于只看当前目录一层**：这种情况请使用 \`list_directory_flat\`
- **不要用于整个 Vault 的轻量总览**：这种情况请使用 \`list_vault_overview\`
- **不要用于定位未知路径**：只知道名称时请先使用 \`find_paths\`
`;
