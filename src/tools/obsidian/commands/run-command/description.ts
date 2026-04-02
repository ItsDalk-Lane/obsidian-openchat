export const RUN_COMMAND_DESCRIPTION = `执行一个已知的 Obsidian command id。

## 何时使用

- 已经拿到明确的 command id，需要触发对应命令时
- 需要调用命令面板、打开视图或执行社区插件命令时

## 何时不使用

- **不要用于发现命令**：先查命令请使用 \`list_commands\`
- **不要用于文件编辑**：Vault 文件修改应优先使用专门的内置工具

## 可用字段

- **command_id**（必需）：要执行的 Obsidian command id

## 返回值

返回 \`command_id\`、\`executed\` 和可选的 \`plugin\`，
用于确认命令是否真正执行。

## 失败恢复

- 如果命令 id 不确定，先改用 \`list_commands\`
- 如果命令不存在，检查 id 是否拼写正确
- 对未知来源或高风险命令，确认会走权限流，不应通过普通参数绕过

## 示例

\`\`\`json
{
  "command_id": "command-palette:open"
}
\`\`\``;
