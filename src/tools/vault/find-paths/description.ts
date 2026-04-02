export const FIND_PATHS_DESCRIPTION = `在不知道准确路径时，按名称、名称片段或路径片段查找文件和目录。

## 何时使用

- 用户只给了文件名、目录名或模糊路径片段时
- 在调用 \`read_file\`、\`open_file\`、\`list_directory_flat\`、
  \`list_directory_tree\` 或 \`list_vault_overview\` 之前，需要先定位准确路径时

## 何时不使用

- **不要用于读取内容**：读文件请使用 \`read_file\`
- **不要用于浏览已知目录**：浏览目录请使用 \`list_directory_flat\`、
  \`list_directory_tree\` 或 \`list_vault_overview\`
- **不要用于正文搜索**：按内容搜索请使用 \`search_content\`

## 可用字段

- **query**（必需）：要查找的文件名、目录名或路径片段
- **scope_path**（可选，默认 \`/\`）：限制查找范围的目录路径
- **target_type**（可选，默认 \`any\`）：限定查找文件、目录或两者
- **match_mode**（可选，默认 \`contains\`）：匹配方式，可选 \`contains\`、
  \`exact\`、\`prefix\`、\`suffix\`、\`glob\`
- **max_results**（可选，默认 100）：最多返回多少条结果
- **response_format**（可选，默认 \`json\`）：返回 \`json\` 或 \`text\`

## 返回值

返回 \`matches\` 数组，每项包含 \`path\`、\`name\`、\`type\`、\`matched_on\`，
以及分页元信息 \`meta\`。

## 失败恢复

- 如果结果太多，缩小 \`scope_path\`、提高匹配精度或降低 \`max_results\`
- 找到路径后，应切换到更具体的工具，不要反复重试 \`find_paths\`

## 示例

\`\`\`json
{
  "query": "meeting",
  "scope_path": "notes",
  "target_type": "file",
  "match_mode": "contains",
  "max_results": 20
}
\`\`\``;
