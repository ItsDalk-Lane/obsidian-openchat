import { EDIT_FILE_DESCRIPTION } from './edit-file/description'
import { FIND_PATHS_DESCRIPTION } from './find-paths/description'
import { DELETE_PATH_DESCRIPTION } from './delete-path/description'
import { MOVE_PATH_DESCRIPTION } from './move-path/description'
import { QUERY_INDEX_DESCRIPTION } from './query-index/description'
import { READ_FILE_DESCRIPTION } from './read-file/description'
import { READ_MEDIA_DESCRIPTION } from './read-media/description'
import { SEARCH_CONTENT_DESCRIPTION } from './search-content/description'
import { WRITE_FILE_DESCRIPTION } from './write-file/description'

export {
  EDIT_FILE_DESCRIPTION,
  FIND_PATHS_DESCRIPTION,
  DELETE_PATH_DESCRIPTION,
  MOVE_PATH_DESCRIPTION,
  QUERY_INDEX_DESCRIPTION,
  READ_FILE_DESCRIPTION,
  READ_MEDIA_DESCRIPTION,
  SEARCH_CONTENT_DESCRIPTION,
  WRITE_FILE_DESCRIPTION,
}
export const READ_FILES_DESCRIPTION = `批量预览多个已知文本文件的部分内容，适合快速筛选候选文件。

## 何时使用

- 已经拿到一组准确文件路径，只需要快速预览每个文件的一部分内容时
- 想比较多个文件的开头或某一段内容时

## 何时不使用

- **不要用于完整阅读长文**：单篇长文请改用 \`read_file\`
- **不要用于发现路径**：查找路径请先使用 \`find_paths\`

## 可用字段

- **file_paths**（必需）：文件路径数组，最多 20 个
- **read_mode**（可选，默认 \`segment\`）：\`segment\` 或 \`head\`
- **start_line**（可选）：仅 \`segment\` 模式可用
- **line_count**（可选）：每个文件返回的行数
- **response_format**（可选，默认 \`json\`）：返回 \`json\` 或 \`text\`

## 参数规则

- \`start_line\` 只能在 \`segment\` 模式下使用
- 如果某个文件需要继续深入阅读，应单独对该文件调用 \`read_file\`

## 返回值

返回 \`files\` 数组。每个元素包含 \`file_path\`、\`content\`、
\`returned_start_line\`、\`returned_end_line\`、\`has_more\`、
\`next_start_line\`、\`truncated\` 和 \`error\`。

## 失败恢复

- 如果某个文件返回 \`error\`，检查该路径是否存在
- 如果预览不够，针对目标文件单独调用 \`read_file\`

## 示例

\`\`\`json
{
  "file_paths": ["notes/a.md", "notes/b.md"],
  "read_mode": "head",
  "line_count": 40
}
\`\`\``;
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

export const STAT_PATH_DESCRIPTION = `读取一个已知文件或目录路径的元数据信息。

## 何时使用

- 已经知道准确路径，想查看大小、修改时间、类型等元信息时
- 需要在读内容前先确认目标是文件还是目录时

## 何时不使用

- **不要用于发现未知路径**：只知道名称时先用 \`find_paths\`
- **不要用于读取正文内容**：请使用 \`read_file\`

## 返回值

返回 \`target_path\`、\`type\`、\`size\`、\`created\`、\`modified\` 等元数据字段。

## 失败恢复

- 如果路径不存在，先用 \`find_paths\` 定位准确路径
- 如果只是想读取正文，不要继续重试此工具，应改用 \`read_file\``;
