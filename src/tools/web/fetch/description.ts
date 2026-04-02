export const FETCH_DESCRIPTION = `兼容型网页抓取工具：统一承载单网页和批量网页抓取。默认请优先使用 \`fetch_webpage\` 或 \`fetch_webpages_batch\` 这两个更窄的 wrapper。

## 何时使用

- 需要兼容旧 prompt、旧脚本或旧工具调用时
- wrapper surface 被关闭，仍需要一个同时兼容单网页和批量网页的入口时
- 需要把网页正文提取成更适合模型消费的 Markdown 时

## 何时不使用

- **不要用于抓取单个已知 URL**：这种情况请直接使用 \`fetch_webpage\`
- **不要用于抓取多个已知 URL**：这种情况请直接使用 \`fetch_webpages_batch\`
- **不要用于读取 Vault 本地文件**：本地文件请使用 \`read_file\`
- **不要用于搜索未知网页**：需要先找网页时请使用 \`bing_search\`
- **不要把它当作浏览器自动化工具**：它只负责抓取和提取内容

## 可用字段

- **url**（单 URL 模式使用）：目标网址，必须是 \`http\` 或 \`https\`
- **urls**（批量模式使用）：多个目标网址组成的数组；提供后会忽略 \`url\`
- **max_length**（可选，默认 5000）：单次最多返回的字符数
- **start_index**（可选，默认 0）：从第几个字符开始返回，用于分页读取长内容
- **raw**（可选，默认 false）：是否跳过 HTML 提取和 Markdown 转换，直接返回原始内容

## 参数规则

- 提供 \`urls\` 时进入批量模式，\`url\` 字段会被忽略
- 单 URL 模式下应提供 \`url\`
- 当响应内容被截断时，使用返回提示中的下一段 \`start_index\` 继续读取

## 返回值

- 单 URL 模式返回处理后的网页内容文本，默认优先返回 Markdown 正文
- 批量模式返回 JSON 数组，每个元素包含 URL、是否成功、内容或错误信息

## 失败恢复

- 如果 URL 格式错误，先修正协议和地址
- 如果正文提取失败，尝试设置 \`raw=true\` 获取原始内容
- 如果内容过长，使用 \`start_index\` 和 \`max_length\` 分页抓取

## 示例

\`\`\`json
{
  "url": "https://example.com/article",
  "max_length": 4000,
  "start_index": 0,
  "raw": false
}
\`\`\``;
