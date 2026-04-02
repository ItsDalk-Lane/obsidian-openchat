export const RUN_SCRIPT_DESCRIPTION = `在受限脚本运行时中执行 JavaScript，用于多步工具编排、条件判断和结果拼装。

## 何时使用

- 需要连续调用多个工具，并根据中间结果决定后续步骤时
- 需要把多个工具结果整合成一个返回值时
- 需要用条件逻辑控制工具调用流程时

## 何时不使用

- **不要用于执行本机命令**：需要调用 OS/CLI 时请使用 \`run_shell\`
- **不要用于直接读写操作系统文件**：请使用对应文件工具
- **不要用于只调用单个工具**：直接调用目标工具即可

## 可用字段

- **script**（必需）：要执行的 JavaScript 代码，最大 12000 字符；脚本内只可使用 \`call_tool(name, args)\` 和 \`moment()\`

## 返回值

返回脚本执行结果。通常是最后 \`return\` 的值，或脚本中调用工具后组合出的对象或文本。

## 失败恢复

- 如果需要执行本机命令，改用 \`run_shell\`
- 如果只是想调用单个工具，直接调用该工具，不要重试 \`run_script\`
- 如果是脚本语法错误，先修正为合法 JavaScript 再重试

## 示例

\`\`\`json
{
  "script": "const result = await call_tool('get_current_time', { timezone: 'Asia/Shanghai' }); return result.timezone;"
}
\`\`\``;
