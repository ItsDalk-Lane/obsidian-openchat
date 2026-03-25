export const READ_FILE_DESCRIPTION = `读取一个已知路径的文本文件，支持整篇读取、分段读取、读取开头和读取结尾。

## 何时使用

- 已经知道准确文件路径，并且需要读取正文内容时
- 需要分页阅读长文本文件时
- 需要先查看开头或结尾片段再决定下一步时

## 何时不使用

- **不要用于发现未知路径**：只知道名称时先用 \`find_paths\`
- **不要用于浏览目录结构**：目录浏览请使用 \`list_directory\`
- **不要用于正文搜索定位**：按内容搜索请使用 \`search_content\`

## 可用字段

- **file_path**（必需）：要读取的文本文件路径，相对于 Vault 根目录
- **read_mode**（可选，默认 \`segment\`）：\`full\`、\`segment\`、\`head\`、\`tail\`
- **start_line**（可选）：仅 \`segment\` 模式可用，从第几行开始读取，第一行为 1
- **line_count**（可选）：\`segment\`、\`head\`、\`tail\` 模式返回的行数
- **response_format**（可选，默认 \`json\`）：返回 \`json\` 或 \`text\`

## 参数规则

- \`start_line\` 只能在 \`segment\` 模式下使用
- 长文默认优先使用 \`segment\`，不要一开始就使用 \`full\`
- 当返回 \`has_more=true\` 时，可用 \`next_start_line\` 继续读取后续片段

## 返回值

返回 \`file_path\`、\`read_mode\`、\`content\`、\`total_lines\`、\`returned_start_line\`、\`returned_end_line\`、\`has_more\`、\`next_start_line\`、\`truncated\`，以及可能出现的 \`warning\` 和 \`suggested_next_call\`。

## 失败恢复

- 如果 \`full\` 模式提示文件过长，改用 \`segment\`
- 如果路径不存在，先用 \`find_paths\` 定位准确路径
- 如果还有剩余内容，按 \`suggested_next_call\` 或 \`next_start_line\` 继续读取

## 示例

\`\`\`json
{
  "file_path": "notes/todo.md",
  "read_mode": "segment",
  "start_line": 1,
  "line_count": 120
}
\`\`\``;

export const READ_MEDIA_DESCRIPTION = `读取一个已知路径的图片或音频文件，并返回可供模型消费的二进制内容与 MIME 信息。

## 何时使用

- 已经知道准确媒体文件路径，需要把图片或音频内容提供给模型时
- 需要读取 Vault 中的非文本媒体资源时

## 何时不使用

- **不要用于读取文本内容**：文本文件请使用 \`read_file\`
- **不要用于查找未知路径**：只知道名称时先用 \`find_paths\`
- **不要用于浏览目录**：目录浏览请使用 \`list_directory\`

## 返回值

返回媒体二进制内容、媒体类型和 MIME 类型，具体结构由运行时统一封装。

## 失败恢复

- 如果路径不存在，先用 \`find_paths\` 定位路径
- 如果文件类型不受支持，改用更合适的工具处理对应文件`;

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

返回 \`files\` 数组。每个元素包含 \`file_path\`、\`content\`、\`returned_start_line\`、\`returned_end_line\`、\`has_more\`、\`next_start_line\`、\`truncated\` 和 \`error\`。

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

export const EDIT_FILE_DESCRIPTION = `按文本片段编辑一个已知路径的文本文件，并支持 dry run 预览 diff。

## 何时使用

- 已经知道准确文件路径，只需要局部修改时
- 想先预览 diff 再决定是否写入时

## 何时不使用

- **不要用于整文件重写**：整文件写入请使用 \`write_file\`
- **不要用于发现路径或浏览目录**：请改用 \`find_paths\` 或 \`list_directory\`

## 可用字段

- **file_path**（必需）：目标文本文件路径
- **edits**（必需）：编辑操作数组，每项包含 \`oldText\` 和 \`newText\`
- **dry_run**（可选，默认 false）：是否只返回 diff 预览而不写入

## 返回值

返回 \`file_path\`、\`dry_run\`、\`applied_edits\`、\`updated\` 和 \`diff\`。

## 失败恢复

- 如果提示找不到待替换文本，先用 \`read_file\` 读取目标片段再重试
- 如果只想查看改动效果，先把 \`dry_run\` 设为 \`true\`

## 示例

\`\`\`json
{
  "file_path": "notes/todo.md",
  "edits": [
    {
      "oldText": "- [ ] old item",
      "newText": "- [x] old item"
    }
  ],
  "dry_run": true
}
\`\`\``;

export const CREATE_DIRECTORY_DESCRIPTION = `创建一个已知路径的目录，必要时递归创建缺失的父目录。

## 何时使用

- 需要为后续写文件或移动文件提前准备目录时
- 需要整理 Vault 目录结构时

## 何时不使用

- **不要用于浏览目录内容**：请使用 \`list_directory\`
- **不要用于查找未知目录路径**：请先使用 \`find_paths\`

## 返回值

返回 \`directory_path\`、\`created\` 和 \`existed\`。

## 失败恢复

- 如果目录路径不合法，修正 \`directory_path\`
- 如果只是想查看目录内容，不要重试当前工具，应改用 \`list_directory\``;

export const LIST_DIRECTORY_DESCRIPTION = `浏览一个已知目录下的内容，或获取整个 Vault 的轻量文件总览，支持 flat、tree 和 vault 三种视图。

## 何时使用

- 已经知道准确目录路径，想查看其中的文件和子目录时
- 需要按名称、大小、正则或树形结构浏览目录时
- 需要快速获取整个 Vault 的文件路径总览，用于 AI 意图规划阶段时

## 何时不使用

- **不要用于发现未知路径**：只知道名称时先用 \`find_paths\`
- **不要用于正文搜索**：按内容搜索请使用 \`search_content\`

## 可用字段

- **directory_path**（可选，默认 \`/\`）：目录路径，相对于 Vault 根目录；\`flat\` 和 \`tree\` 模式使用，根目录可传 \`/\`；\`vault\` 模式只能省略或传 \`/\`
- **view**（可选，默认 \`flat\`）：\`flat\` 返回单层列表，\`tree\` 返回递归目录树，\`vault\` 返回整个 Vault 的文件路径列表
- **include_sizes**（可选，默认 false）：仅 \`flat\` 模式可用，是否返回大小信息
- **sort_by**（可选，默认 \`name\`）：仅 \`flat\` 模式可用，可按名称或大小排序
- **regex**（可选）：仅 \`flat\` 模式可用，用于按名称过滤
- **exclude_patterns**（可选）：仅 \`tree\` 模式可用，用于排除 glob 模式
- **limit**（可选，默认 100）：仅 \`flat\` 模式分页大小，最大 500
- **offset**（可选，默认 0）：仅 \`flat\` 模式偏移量
- **max_depth**（可选，默认 5）：仅 \`tree\` 模式递归深度上限
- **max_nodes**（可选，默认 200）：仅 \`tree\` 模式最多返回的节点数
- **file_extensions**（可选）：仅 \`vault\` 模式可用，文件扩展名过滤数组，例如 \`["md", "ts"]\`，元素不要带点号
- **vault_limit**（可选，默认 1000）：仅 \`vault\` 模式可用，最多返回多少条文件路径，最大 5000；默认值适合 AI 场景的全库概览
- **response_format**（可选，默认 \`json\`）：返回 \`json\` 或 \`text\`

## 参数规则

- \`flat\` 模式下可使用 \`include_sizes\`、\`sort_by\`、\`regex\`、\`limit\`、\`offset\`，不要传 \`tree\` 或 \`vault\` 专属参数
- \`tree\` 模式下可使用 \`exclude_patterns\`、\`max_depth\`、\`max_nodes\`，不要传 \`flat\` 或 \`vault\` 专属参数
- \`vault\` 模式下只能从 Vault 根目录遍历；可使用 \`file_extensions\` 和 \`vault_limit\`，不要传 \`flat\` 或 \`tree\` 专属参数
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

export const MOVE_PATH_DESCRIPTION = `移动或重命名一个已知的文件或目录路径。

## 何时使用

- 已经知道源路径和目标路径，需要重命名时
- 需要把文件或目录移动到新位置时

## 何时不使用

- **不要用于查找未知路径**：请先使用 \`find_paths\`
- **不要用于复制文件**：该工具只负责移动或重命名

## 返回值

返回 \`source_path\`、\`destination_path\` 和 \`moved\`。

## 失败恢复

- 如果源路径不存在，先检查路径或用 \`find_paths\` 定位
- 如果目标路径已存在，换一个目标路径后再重试`;

export const FIND_PATHS_DESCRIPTION = `在不知道准确路径时，按名称、名称片段或路径片段查找文件和目录。

## 何时使用

- 用户只给了文件名、目录名或模糊路径片段时
- 在调用 \`read_file\`、\`open_file\`、\`list_directory\` 之前，需要先定位准确路径时

## 何时不使用

- **不要用于读取内容**：读文件请使用 \`read_file\`
- **不要用于浏览已知目录**：浏览目录请使用 \`list_directory\`
- **不要用于正文搜索**：按内容搜索请使用 \`search_content\`

## 可用字段

- **query**（必需）：要查找的文件名、目录名或路径片段
- **scope_path**（可选，默认 \`/\`）：限制查找范围的目录路径
- **target_type**（可选，默认 \`any\`）：限定查找文件、目录或两者
- **match_mode**（可选，默认 \`contains\`）：匹配方式，可选 \`contains\`、\`exact\`、\`prefix\`、\`suffix\`、\`glob\`
- **max_results**（可选，默认 100）：最多返回多少条结果
- **response_format**（可选，默认 \`json\`）：返回 \`json\` 或 \`text\`

## 返回值

返回 \`matches\` 数组，每项包含 \`path\`、\`name\`、\`type\`、\`matched_on\`，以及分页元信息 \`meta\`。

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

export const DELETE_PATH_DESCRIPTION = `永久删除一个已知文件或目录路径；删除目录时会递归删除其内容。

## 何时使用

- 用户明确要求删除文件或目录，并且路径已经确认无误时

## 何时不使用

- **不要用于查找路径**：只知道名称时先用 \`find_paths\`
- **不要用于清空文件内容**：清空内容请使用 \`write_file\`
- **不要在路径不确定时执行**：删除是破坏性操作

## 返回值

返回 \`target_path\`、\`existed\` 和 \`deleted\`。

## 失败恢复

- 如果路径不存在，先确认路径是否正确
- 如果目标是根目录，停止操作并修正路径
- 如果只是想重组内容，不要使用删除，改用移动或编辑工具`;

export const SEARCH_CONTENT_DESCRIPTION = `递归搜索文件正文内容，支持普通文本匹配和正则匹配。

## 何时使用

- 已经明确要在文件正文里找关键词、短语、模式或代码片段时
- 需要带上下文行地查看匹配位置时

## 何时不使用

- **不要用于按文件名查路径**：请使用 \`find_paths\`
- **不要用于读取某个已知文件的完整内容**：请使用 \`read_file\`

## 可用字段

- **pattern**（必需）：要搜索的文本或正则表达式
- **match_mode**（可选，默认 \`literal\`）：\`literal\` 或 \`regex\`
- **scope_path**（可选，默认 \`/\`）：限制搜索范围的目录
- **file_types**（可选）：扩展名过滤列表，例如 \`["md", "ts"]\`
- **max_results**（可选，默认 50）：返回的最大匹配数量
- **case_sensitive**（可选，默认 false）：是否区分大小写
- **context_lines**（可选，默认 0）：返回命中前后的上下文行数
- **response_format**（可选，默认 \`json\`）：返回 \`json\` 或 \`text\`

## 返回值

返回 \`matches\` 和 \`meta\`。其中 \`meta\` 包含 \`scanned_files\`、\`skipped_files\`、\`returned\`、\`has_more\` 等信息。

## 失败恢复

- 如果结果太多，缩小 \`scope_path\`、降低 \`max_results\` 或增加 \`file_types\` 过滤
- 如果只是想读某个已知文件，不要继续重试此工具，应改用 \`read_file\`

## 示例

\`\`\`json
{
  "pattern": "TODO",
  "match_mode": "literal",
  "scope_path": "notes",
  "file_types": ["md"],
  "context_lines": 2
}
\`\`\``;

export const QUERY_INDEX_DESCRIPTION = `按结构化参数查询 Vault 的文件元数据、属性统计、标签统计或任务数据。

## 何时使用

- 需要做文件统计、标签统计、属性统计或任务筛选时
- 需要使用结构化字段、过滤、聚合、排序和分组能力时

## 何时不使用

- **不要用于发现未知路径**：查路径请使用 \`find_paths\`
- **不要用于浏览目录结构**：浏览目录请使用 \`list_directory\`
- **不要用于全文搜索**：正文搜索请使用 \`search_content\`

## 可用字段

- **data_source**（必需）：数据源，可选 \`file\`、\`property\`、\`tag\`、\`task\`
- **select**（必需）：返回字段和聚合定义
- **filters**（可选）：过滤条件组合
- **group_by**（可选）：分组字段
- **order_by**（可选）：排序定义
- **limit**（可选，默认 100）：返回行数上限
- **offset**（可选，默认 0）：结果偏移量
- **response_format**（可选，默认 \`json\`）：返回 \`json\` 或 \`text\`

## 参数规则

- 字段名必须使用公开的 snake_case 字段
- \`sum\` 和 \`avg\` 聚合通常需要提供 \`field\`
- \`order_by.field\` 应引用 \`select\` 中已有字段或聚合别名

## 返回值

返回 \`columns\`、\`rows\` 和 \`meta\`。其中 \`meta\` 包含 \`data_source\`、\`total_before_limit\`、\`limit\`、\`offset\` 和 \`truncated\`。

## 失败恢复

- 如果字段名无效，改用公开的 snake_case 字段
- 如果只是要找文件地址，不要继续重试当前工具，应改用 \`find_paths\`

## 示例

\`\`\`json
{
  "data_source": "task",
  "select": {
    "fields": ["file_path", "status"]
  },
  "filters": {
    "match": "all",
    "conditions": [
      {
        "field": "completed",
        "operator": "eq",
        "value": false
      }
    ]
  },
  "limit": 20
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
