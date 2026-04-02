export const READ_MCP_RESOURCE_DESCRIPTION = `读取一个已知 MCP 资源的内容。

## 何时使用

- 已经通过 \`list_mcp_resources\` 拿到精确 \`server_id\` 与 \`uri\` 时
- 需要读取某个 MCP 资源的正文或二进制 base64 内容时
- 需要把外部 MCP 资源作为只读上下文使用时

## 何时不使用

- **不要猜 URI**：如果还没有稳定 URI，请先运行 \`list_mcp_resources\`
- **不要用于执行工具**：调用 MCP tool 请使用外部 MCP tool 通道
- **不要用于写入**：当前工具只读，不支持修改资源

## 可用字段

- **server_id**（必需）：资源所在的 MCP server id
- **uri**（必需）：要读取的精确资源 URI

## 返回值

返回：

- \`server_id\` / \`server_name\` / \`uri\`
- \`contents\`：资源内容数组，每项包含
  - \`kind\`：\`text\` 或 \`blob\`
  - \`text\` 或 \`blob_base64\`
  - 可选的 \`mime_type\`
  - \`truncated\`：内容是否因输出限制被截断

## 失败恢复

- 如果 server 不存在或已禁用，先回到 \`list_mcp_resources\` 重新确认 \`server_id\`
- 如果 URI 不确定，不要继续重试当前工具，应先重新列资源
- 如果返回的是大体积二进制内容，优先缩小目标资源范围，避免反复读取超大 blob

## 示例

\`\`\`json
{
  "server_id": "github",
  "uri": "repo://openchat/docs/architecture"
}
\`\`\``
