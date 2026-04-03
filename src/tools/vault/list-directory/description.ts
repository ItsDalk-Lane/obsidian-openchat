export const LIST_DIRECTORY_DESCRIPTION = `兼容型目录浏览工具；当 wrapper
surface 已启用时，优先使用 \`list_directory_flat\`、\`list_directory_tree\`
或 \`list_vault_overview\`。该工具支持 flat、tree 和 vault 三种视图。

## 何时使用

- 已经知道准确目录路径，想查看其中的文件和子目录时
- 需要按名称、大小、正则或树形结构浏览目录时
- 需要快速获取整个 Vault 的文件路径总览，用于 AI 意图规划阶段时

## 何时不使用

- **不要用于发现未知路径**：只知道名称时先用 \`find_paths\`
- **不要用于正文搜索**：按内容搜索请使用 \`search_content\`

## 可用字段

- **directory_path**（可选，默认 \`/\`）：
  目录路径，相对于 Vault 根目录；\`flat\` 和 \`tree\` 模式使用，根目录可传
  \`/\`；\`vault\` 模式只能省略或传 \`/\`
- **view**（可选，默认 \`flat\`）：
  \`flat\` 返回单层列表，\`tree\` 返回递归目录树，\`vault\`
  返回整个 Vault 的文件路径列表
- **include_sizes**（可选，默认 false）：仅 \`flat\` 模式可用，是否返回大小信息
- **sort_by**（可选，默认 \`name\`）：仅 \`flat\` 模式可用，可按名称或大小排序
- **regex**（可选）：仅 \`flat\` 模式可用，用于按名称过滤
- **exclude_patterns**（可选）：仅 \`tree\` 模式可用，用于排除 glob 模式
- **limit**（可选，默认 100）：仅 \`flat\` 模式分页大小，最大 500
- **offset**（可选，默认 0）：仅 \`flat\` 模式偏移量
- **max_depth**（可选，默认 5）：仅 \`tree\` 模式递归深度上限
- **max_nodes**（可选，默认 200）：仅 \`tree\` 模式最多返回的节点数
- **file_extensions**（可选）：仅 \`vault\` 模式可用，文件扩展名过滤数组，例如 \`["md", "ts"]\`，元素不要带点号
- **vault_limit**（可选，默认 1000）：
  仅 \`vault\` 模式可用，最多返回多少条文件路径，最大 5000；
  默认值适合 AI 场景的全库概览
- **response_format**（可选，默认 \`json\`）：返回 \`json\` 或 \`text\`

## 参数规则

- \`flat\` 模式下可使用 \`include_sizes\`、\`sort_by\`、\`regex\`、\`limit\`、
  \`offset\`，不要传 \`tree\` 或 \`vault\` 专属参数
- \`tree\` 模式下可使用 \`exclude_patterns\`、\`max_depth\`、\`max_nodes\`，
  不要传 \`flat\` 或 \`vault\` 专属参数
- \`vault\` 模式下只能从 Vault 根目录遍历；可使用 \`file_extensions\`
  和 \`vault_limit\`，不要传 \`flat\` 或 \`tree\` 专属参数
- 结果被截断时，应调整 \`limit\`、\`offset\`、\`max_depth\` 或 \`max_nodes\`

## 返回值

- \`flat\` 模式返回 \`items\` 和 \`meta\`
- \`tree\` 模式返回 \`tree\` 和 \`meta\`
- \`vault\` 模式返回 \`paths\` 和 \`meta\`
- 当 \`include_sizes=true\` 时，还会返回 \`summary\`

## 失败恢复

- 如果目录不存在，先用 \`find_paths\` 定位目录
- 如果只是想查单个文件的路径，不要继续重试此工具，应改用 \`find_paths\`

## 示例

\`\`\`json
{
  "directory_path": "notes",
  "view": "flat",
  "include_sizes": true,
  "sort_by": "name",
  "limit": 50,
  "offset": 0
}
\`\`\`

\`\`\`json
{
  "view": "vault",
  "file_extensions": ["md", "canvas"],
  "vault_limit": 1000
}
\`\`\``;