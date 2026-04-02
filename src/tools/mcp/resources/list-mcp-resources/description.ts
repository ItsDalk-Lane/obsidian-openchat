export const LIST_MCP_RESOURCES_DESCRIPTION = `列出当前已连接 MCP server 暴露的资源。

## 何时使用

- 需要先发现某个 MCP server 提供了哪些资源时
- 需要拿到稳定的 \`server_id\` 与 \`uri\`，再继续读取资源时
- 不希望模型凭空猜测资源 URI 时

## 何时不使用

- **不要直接猜 URI**：读取前请先运行 \`list_mcp_resources\`
- **不要用于执行 MCP 工具**：调用工具请走外部 MCP tool 通道
- **不要用于写入**：当前能力只读，不支持修改远端资源

## 可用字段

- **server_id**（可选）：只列出某个已启用 server 的资源
- **query**（可选）：按 URI、名称、标题、描述或 MIME 类型过滤
- **max_results**（可选，默认 100）：最大返回资源条数

## 返回值

返回：

- \`total\`：过滤后资源总数
- \`truncated\`：是否因 \`max_results\` 被截断
- \`resources\`：资源列表，每项包含
  - \`server_id\`
  - \`server_name\`
  - \`uri\`
  - \`name\`
  - 可选的 \`title\` / \`description\` / \`mime_type\` / \`size\`

## 失败恢复

- 如果没有任何结果，先检查 MCP server 是否已启用并真正暴露资源
- 如果结果太多，补充 \`server_id\` 或 \`query\`
- 如果已经拿到精确 \`server_id\` 与 \`uri\`，下一步改用 \`read_mcp_resource\`

## 示例

\`\`\`json
{
  "server_id": "github",
  "query": "repo",
  "max_results": 20
}
\`\`\``
