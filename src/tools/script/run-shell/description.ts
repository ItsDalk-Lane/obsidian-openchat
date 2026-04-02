export const RUN_SHELL_DESCRIPTION = `执行本机 shell 命令，仅在桌面端环境中可用。

## 何时使用

- 确实需要调用操作系统命令、脚本文件或外部程序时
- 现有内置工具无法满足需求，必须下沉到 CLI 时

## 何时不使用

- **不要用于工具编排或条件分支**：这类逻辑请使用 \`run_script\`
- **不要把它当作文件读取抽象**：Vault 内文件请优先使用文件系统工具
- **不要在平台不支持时反复重试**：移动端或非桌面环境可能直接不可用

## 可用字段

- **command**（必需）：要执行的 shell 命令
- **cwd**（可选）：工作目录。可传绝对路径，或传相对于 Vault 根目录的路径；默认是 Vault 根目录

## 返回值

返回 \`supported\`、\`cwd\`、\`stdout\`、\`stderr\`、\`exitCode\`、\`timedOut\`，用于判断命令是否执行、输出了什么以及是否超时。

## 失败恢复

- 如果只是想让多个工具协作，改用 \`run_script\`
- 如果返回 \`supported=false\`，确认当前是否为桌面端环境
- 如果命令执行失败，先检查 \`stderr\`、\`exitCode\` 和 \`cwd\`

## 示例

\`\`\`json
{
  "command": "ls -la",
  "cwd": "scripts"
}
\`\`\``;
