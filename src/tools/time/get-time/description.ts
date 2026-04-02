export const GET_TIME_DESCRIPTION = `兼容型时间工具：统一承载当前时间、时区换算和自然语言时间范围解析。默认请优先使用 \`get_current_time\`、\`convert_time\` 或 \`calculate_time_range\` 这三个更窄的 wrapper。

## 何时使用

- 需要兼容旧 prompt、旧脚本或旧工具调用时
- wrapper surface 被关闭，仍希望用单个多模式工具承载 current/convert/range 时
- 需要补充星期、DST、ISO 周等时间信息时

## 何时不使用

- **默认不要直接用于单一时间任务**：当前时间请用 \`get_current_time\`，时区换算请用 \`convert_time\`，自然语言时间范围解析请用 \`calculate_time_range\`
- **不要用于复杂日程规划**：它只提供取时、时区换算和常见自然语言时间范围解析
- **不要用于文件或网络操作**：请使用对应工具

## 可用字段

- **mode**（可选，默认 \`current\`）：工具模式，\`current\` 获取当前时间，\`convert\` 转换时区，\`range\` 解析自然语言时间范围
- **timezone**（可选）：\`current\` 或 \`range\` 模式使用的 IANA 时区名称
- **source_timezone**（可选）：\`convert\` 模式的源 IANA 时区名称
- **target_timezone**（可选）：\`convert\` 模式的目标 IANA 时区名称
- **time**（可选）：\`convert\` 模式要转换的时间，格式为 24 小时制 \`HH:MM\`
- **natural_time**（可选）：\`range\` 模式要解析的自然语言时间表达，支持中文和英文，例如 \`上周\`、\`昨天\`、\`last week\`、\`past 3 days\`

## 参数规则

- \`current\` 模式下只能使用 \`timezone\`
- \`convert\` 模式下必须同时提供 \`source_timezone\`、\`target_timezone\` 和 \`time\`
- \`convert\` 模式下不要传 \`timezone\`
- \`range\` 模式下必须提供 \`natural_time\`，可选传 \`timezone\`
- \`range\` 模式下不要传 \`source_timezone\`、\`target_timezone\` 或 \`time\`

## 返回值

- \`current\` 模式返回单个时区的时间信息
- \`convert\` 模式返回 \`source\`、\`target\` 和 \`time_difference\`
- \`range\` 模式返回 \`start\`、\`end\`、\`start_datetime\`、\`end_datetime\`、\`timezone\` 和 \`parsed_expression\`

## 失败恢复

- 如果参数与 \`mode\` 不匹配，按模式要求修正字段
- 如果只需要当前时间，不要传 \`convert\` 专用字段
- 如果自然语言时间无法识别，请改用支持的表达方式，例如 \`上周\`、\`本月\`、\`past 7 days\`
`;
