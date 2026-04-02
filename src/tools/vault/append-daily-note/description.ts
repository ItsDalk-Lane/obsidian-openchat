export const APPEND_DAILY_NOTE_DESCRIPTION = `向今日或指定日期的 daily note 追加内容。

## 何时使用

- 需要把会议纪要、日志、灵感或待办追加到 daily note 时
- 已经确认要写入 daily note，但不想让模型自己猜路径规则时

## 何时不使用

- **不要用于普通已知文件追加**：明确文件路径时改用 \`edit_file\` 或 \`write_file\`
- **不要用于 frontmatter/Properties 修改**：属性编辑应使用专门的结构化工具

## 可用字段

- **date**（可选）：目标日期，格式为 \`YYYY-MM-DD\`；省略时默认今天
- **content**（必需）：要追加到 daily note 的正文内容
- **section_heading**（可选）：目标标题文本；存在时追加到该标题下，不存在时自动补出标题

## 返回值

返回 \`file_path\`、\`created\`、\`updated\` 和 \`inserted_under_heading\`，
用于判断目标文件路径、是否新建文件，以及是否按标题插入。

## 失败恢复

- 如果 \`date\` 格式不对，改成 \`YYYY-MM-DD\`
- 如果 daily notes 配置无法读取，先检查 \`.obsidian/daily-notes.json\`
- 如果只是想写入普通笔记，不要继续重试当前工具，应改用显式文件工具

## 示例

\`\`\`json
{
  "date": "2026-04-02",
  "content": "- 完成 append_daily_note 工具落地",
  "section_heading": "Work Log"
}
\`\`\``;
