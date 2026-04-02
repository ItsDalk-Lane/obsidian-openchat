export const QUERY_INDEX_DESCRIPTION = `按结构化参数查询 Vault 的文件元数据、属性统计、标签统计或任务数据。

## 何时使用

- 需要做文件统计、标签统计、属性统计或任务筛选时
- 需要使用结构化字段、过滤、聚合、排序和分组能力时

## 何时不使用

- **不要用于发现未知路径**：查路径请使用 \`find_paths\`
- **不要用于浏览目录结构**：浏览目录请使用 \`list_directory_flat\`、\`list_directory_tree\` 或 \`list_vault_overview\`
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

返回 \`columns\`、\`rows\` 和 \`meta\`。其中 \`meta\` 包含 \`data_source\`、
\`total_before_limit\`、\`limit\`、\`offset\` 和 \`truncated\`。

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