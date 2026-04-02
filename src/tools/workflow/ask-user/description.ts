export const ASK_USER_DESCRIPTION = `向用户发起澄清问题并等待回答。

## 何时使用

- 缺少关键意图、目标路径、候选项时，需要先问清楚再继续
- 需要把多个明确选项交给用户选择，避免模型自行猜测

## 何时不使用

- **不要用于权限确认**：高风险操作应由工具自己的 \`checkPermissions()\` /
  \`requestConfirmation()\` 处理
- **不要替代可推断信息**：
  如果能从上下文、当前文件或已有工具结果中确定，就不要打断用户

## 可用字段

- **question**（必需）：要向用户展示的问题
- **options**（可选）：可供选择的选项数组，每项包含 \`label\`、\`value\`，
  可附带 \`description\`
- **allow_free_text**（可选）：是否允许用户输入自由文本答案

## 返回值

返回 \`answered\`、\`selected_value\`、\`free_text\`，用于判断用户是否已回答，
以及回答来自选项还是自由文本。

## 失败恢复

- 如果返回“当前执行通道未提供用户输入能力”，
  说明宿主环境无法弹出澄清 UI
- 如果用户取消了问题，请先总结缺失的信息，再决定是否再次询问

## 示例

\`\`\`json
{
  "question": "这次要更新哪个目录？",
  "options": [
    { "label": "文档", "value": "docs" },
    { "label": "源码", "value": "src" }
  ],
  "allow_free_text": true
}
\`\`\``;
