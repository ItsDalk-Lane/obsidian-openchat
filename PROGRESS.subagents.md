# pi-subagents 实施进度

## 约束与恢复点

- 分支：`feat/builtin-subagents`
- 工作树：`/Users/study_superior/Desktop/Code/pi-web-sa`
- 只修改任务书白名单；并行 web-access 文件只读不碰。
- 规划技能通常要求的 `task_plan.md`、`findings.md`、`progress.md` 与白名单冲突，本文件合并承担计划、发现和进度记录。

## 计划

1. [完成] 任务 0：基线检查与 `pi-subagents` 源码核验
2. [完成] 任务 1：内置注入与 binary 兜底
3. [完成] 任务 2：配置层与单测
4. [完成] 任务 3：API 与 curl 验收
5. [完成] 任务 4：管理 UI
6. [完成] rebase、全量复验、白名单审计、提交

## 执行记录

- 2026-07-30：从 `main` 的 `7d5c202` 创建独立工作树并运行 `npm install`；依赖已是最新，未主动处理现有安全告警。
- 2026-07-30：`npm ci` 后基线 `npm run check` 通过。主测试 `tests/pass/fail/skipped = 255/255/0/0`，Pi adapter `11/11/0/0`，合计 `266/266/0/0`；typecheck、lint 均通过。

## 任务 0 源码核验

- Agent 目录与发现：内置目录由 `src/agents/agents.ts:1519` 指向包根 `agents/`；用户会读额外环境目录、`<PI_CODING_AGENT_DIR>/agents`（默认 `~/.pi/agent/agents`）及兼容目录 `~/.agents`；项目会读最近项目根的旧目录 `.agents` 和首选 `.pi/agents`（`1493-1506`、`1537-1566`）。
- 覆盖顺序：运行态先放 builtin，再放 package，再由 user 覆盖，最后由 project 覆盖（`src/agents/agent-selection.ts:10-24`）；项目同名优先。
- Frontmatter：源码明确支持并解析本任务托管的 `name/description/tools/model/fallbackModels/thinking/systemPromptMode/inheritProjectContext/inheritSkills/skills/async/timeoutMs` 与正文；未知键进入 `extraFields`（`agents.ts:1306-1453`，字段全集见 `agent-serializer.ts:4-34`）。
- Settings：用户文件为 `<PI_CODING_AGENT_DIR>/settings.json`（默认 `~/.pi/agent/settings.json`），项目文件为最近项目根 `.pi/settings.json`；键确认为 `subagents.defaultModel/defaultThinking/disableBuiltins/agentOverrides`，且项目设置优先（`agents.ts:567-573,736-829,921-973`）。
- Chains：用户目录为 `<PI_CODING_AGENT_DIR>/chains`，项目目录为最近项目根 `.pi/chains`；读取 `*.chain.md`/`*.chain.json`（`agents.ts:214-216,1459-1482,1509-1517`）。
- Binary：`src/runs/shared/pi-spawn.ts:134-152` 先读 `PI_SUBAGENT_PI_BINARY`，否则尝试解析 SDK 的可运行入口，再退回 PATH 中的 `pi`。
- YAML：`require.resolve("yaml")` 得到工作树根 `node_modules/yaml/dist/index.js`，动态 import 的 `parse`/`stringify` 均为函数；`npm ls yaml --depth=1` 显示其由现有依赖提供，无需新增依赖。
- 内置角色：包根 `agents/*.md` 实际为 9 个，源码常量也列 9 个；与任务书“8 个”不一致，已写入 `BLOCKED.subagents.md`，实现按源码动态列出全部角色，不硬编码数量。

## 任务 1 证据

- 单测：`node --test lib/subagents-config.test.mjs` 得到 `tests/pass/fail/skipped = 2/2/0/0`；未设置时 `PI_SUBAGENT_PI_BINARY` 指向存在的 SDK 可执行文件，预设 `/custom/pi` 时不覆盖。
- 静态验证：`npm run typecheck` 与 `npm run lint -- --quiet` 均通过。
- 正向 e2e：`next dev -p 30161` 后创建会话 `019fb062-7faf-7b89-89b4-0fab5cbbbb90`，`get_tools` 返回 `mcp, subagent, subagent_wait, subagent_supervisor, intercom` 等工具。
- 反向 e2e：临时把包名改为 `pi-subagents-definitely-missing`，新会话 `019fb062-ca23-7261-ae2a-bb77816eb5a7` 的 `get_tools` 只有基础工具和 `mcp`，没有任何 subagent 工具；服务日志明确提示内置包不存在。随后已恢复 `packageName: "pi-subagents"`。

## 任务 2 证据

- 配置层支持 builtin/user/project 三域递归发现；沿用运行时的兼容目录与同域优先顺序，项目同名项会标明覆盖 user 或 builtin。
- 新建、读取、编辑、删除只开放 user/project；builtin 明确只读。编辑时通过 YAML 文档节点只更新托管字段，未知键及嵌套值保留。
- Settings 仅合并 `subagents.defaultModel/defaultThinking/disableBuiltins/agentOverrides`，根级其他设置、`subagents` 其他键、覆盖项其他字段均保留；写入走同目录 tmp + rename。
- Chains 只读列出 user/project 的 Markdown 或 JSON 流程链名称与描述。
- `node --test lib/subagents-config.test.mjs` 得到 `6/6` 通过、`fail/skipped/todo = 0/0/0`，覆盖 binary 两种情况、frontmatter 未托管键往返、settings 保真、三域与覆盖标记、chains 只读发现。
- 修正类型问题后，`npm run typecheck` 与 `npm run lint -- --quiet` 均通过。

## 任务 3 证据

- 新增 agents、settings、chains 三条路由；agents 的 POST/PUT/DELETE 与 settings PUT 成功后都会尝试重载指定的空闲活动会话，运行中的会话不打断。
- API 验收使用隔离目录 `PI_CODING_AGENT_DIR=/tmp/pi-web-sa-api-agent.eCk6Ai` 和 `PI_WEB_DATA_DIR=/tmp/pi-web-sa-api-data.IezKt2`，未触碰用户配置和用户数据库。
- 红：首次 POST 虽返回成功，但落地 frontmatter 是单行 flow map；源码逐行解析器不兼容。绿：强制 block map 后重建，实际文件为逐行 `name/description/tools/.../timeoutMs` 加正文，GET 列表准确返回该 user agent 且 diagnostics 为空。
- PUT agent 已实测把 description、tools、thinking、async、timeoutMs 和正文更新成功；DELETE 在重建前也返回 `success: true`。Chains GET 返回合法只读结构。
- Settings 前后 `diff -u` 只增加目标四类键；根级 `theme: keep-me`、`models.default: untouched` 与 `subagents.preservedOption.enabled: true` 均保持不变。PUT 返回 defaultModel、defaultThinking、disableBuiltins 和 web-manager 覆盖项。
- API 完成后再次运行配置层 6 个单测与 typecheck，均通过。

## 安全审查

- 新增接口受全局同源与局域网令牌检查保护；React 仅按普通文本渲染用户内容，没有注入 HTML。
- Agent 名称使用白名单字符集，创建路径不能包含目录跳转；builtin 不可写，删除拒绝符号链接，文件更新限制在发现目录内。
- 审查发现首版路由直接信任 `cwd`，会让调用方把项目级配置指向任意现存目录。已补上与 files/skills/models 相同的允许根目录检查，越界请求返回 403；最终验收会覆盖反向请求。
- 未加入独立限流：本地应用已有统一请求边界，且本任务不能改全局代理；该项不扩张到白名单外。

## 任务 4 证据

- `SubagentsConfig` 已提供 Agents、设置、Chains 三页签。
- Agents 按 builtin/user/project 分组，支持 user/project 新建、编辑、删除二次确认；启停开关可选择把覆盖写入用户级或项目级。
- 设置页从 `/api/models` 读取模型下拉，支持 defaultModel、defaultThinking、disableBuiltins，并逐 agent 编辑 model/thinking 覆盖；Chains 页只读显示两域条目。
- AppShell 只增加组件 import、打开状态、Agents 菜单项和弹窗挂载；实际 `git diff -- components/AppShell.tsx` 为 4 个小块，没有改动旁边流程。
- 安全补强后再次运行 `npm run typecheck && npm run lint -- --quiet`，均通过。

## 最终复验

- `git rebase main`：本地 `main` 为 `7d5c202`，分支已是最新，无冲突。
- 正向注入：隔离数据目录下新会话 `019fb071-0cf7-70ac-852f-273bf3c9ad06` 的 `get_tools` 返回 `subagent`、`subagent_wait`、`subagent_supervisor`、`intercom`。
- 反向注入：临时使用不存在包名 `pi-subagents-final-missing` 后，新会话 `019fb071-c5cc-772a-a300-d7b949a4e5dd` 的工具只有基础工具与 `mcp`，subagentTools 为空；随后已恢复真实包名。
- 最终 API：POST `final-proof` 后 Markdown 逐行 frontmatter 落地，GET 列表命中且 diagnostics 为空；settings diff 只增加托管键，`unrelated: must-stay` 与 `subagents.preserved: 42` 保持；`cwd=/etc` 反向请求返回 `403 {"error":"Access denied"}`。
- 最终 `npm run check` 全绿：主测试 `tests/pass/fail/skipped = 261/261/0/0`，Pi adapter `11/11/0/0`，合计 `272/272/0/0`；比基线增加 6 个测试，skipped 仍为 0。

## 错误记录

- 任务 0 基线检查第 1 次失败：`npm run check` 在 typecheck 阶段报 `sh: tsc: command not found`。核查发现工作树内没有 `node_modules`；前一次 `npm install` 虽输出 “up to date”，实际没有把依赖装入工作树，下一步改用明确的本地安装策略诊断并补装。
- 处理：改用 `npm ci` 后实际安装 1523 个包；第 2 次 `npm run check` 全绿。
- 任务 2 静态检查第 1 次失败：YAML 文档空内容兜底赋值触发泛型节点类型不兼容（`TS2322`）；初始化本来就使用 `{}`，该兜底分支不可能为空，已删除多余赋值，待第 2 次验证。
- 任务 3 API 首次创建暴露真实兼容问题：新文件 frontmatter 被 YAML 库输出成单行 flow map，而 `pi-subagents` 源码只逐行识别 `key: value`，插件会忽略该 agent。已改为强制 block map，并在单测加入首行结构断言；这是任务书要求的红→绿证据，修复后重新创建验收。
