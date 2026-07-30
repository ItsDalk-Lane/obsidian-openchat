# pi-web-access 开工回执
- 分支/worktree：`feat/builtin-web-access`，`/Users/study_superior/Desktop/Code/pi-web-wa`。
- 基线：typecheck 通过、lint 通过；tests 266、pass 266、fail 0、skipped 0。
- 首次基线因依赖误装在主目录而缺少 `tsc`；改在 worktree 单独执行 `npm install` 后通过，包文件未改。
- 源码路径顺序：`PI_CODING_AGENT_DIR` → `XDG_CONFIG_HOME/pi` → `~/.pi`，文件名 `web-search.json`。
- 源码默认工具名：`web_search`、`source_check`、`fetch_content`、`get_search_content`。
- 托管核心 key 以 0.15.0 源码为准；任务书列出的 `search1apiApiKey` 不存在，故移除；高级 `cloudflareApiKey`/`firecrawlApiKey` 不纳入核心面。
- 已读 `lib/mcp-config.ts`、`app/api/mcp/route.ts`、`components/McpConfig.tsx`、`lib/api-client.ts`。
- 核对无阻塞，开始任务 1。

## 任务 1：内置注入（完成）
- 新增 `lib/bundled/web-access.ts`，并在注册表只增加 `webAccessSpec` 一行。
- 正向命令：`POST /api/agent/new` 后对会话执行 `{"type":"get_tools"}`。
- 正向输出：`["read","bash","edit","write","grep","find","ls","mcp","web_search","source_check","fetch_content","get_search_content"]`。
- 反向命令：临时改为不存在的包名，重建会话并执行相同 `get_tools`。
- 反向输出：`["read","bash","edit","write","grep","find","ls","mcp"]`。
- 已还原 `packageName: "pi-web-access"` 并再次得到正向输出，证明联网工具来自内置注入。

## 任务 2：配置层（完成）
- 红证据：`node --test lib/web-access-config.test.mjs` → `ERR_MODULE_NOT_FOUND`，tests 1 / fail 1。
- 绿证据：同命令 → tests 4 / pass 4 / fail 0 / skipped 0；`npm run typecheck` 通过。
- 覆盖：密钥掩码与 `***` 还原、未托管顶层/嵌套字段保留、`$HOME` 与 `!touch ...` 字面保存且命令未执行、坏 JSON 返回带路径错误且进程继续。
- 写入采用同目录临时文件加原子重命名；不存在的配置读取为空对象。

## 任务 3：配置 API（完成）
- `PUT fake-openai-key` 输出：`{"success":true,"config":{"openaiApiKey":"***","provider":"openai","webSearch":{"enabled":false}},"path":"/tmp/pi-web-wa-e2e.O8ALJT/agent/web-search.json"}`。
- 随后 `GET` 输出仍为 `openaiApiKey:"***"`；再 `PUT openaiApiKey:"***"` 后，原文件仍是 `"openaiApiKey": "fake-openai-key"`。
- `PUT` 字面值后原文件包含 `"braveApiKey": "$HOME"` 与 `"exaApiKey": "!touch /tmp/pi-web-wa-e2e.O8ALJT/should-not-exist"`。
- 命令标记检查输出：`command_marker_absent=true`，证明保存过程没有执行命令。
- 未托管字段核验输出：`{"unmanaged_fields_preserved":true,"githubClone":{"enabled":false,"maxRepoSizeMB":321},"youtube":{"enabled":true},"futureOption":"keep"}`。

## 任务 4：配置 UI（完成）
- 新增核心配置弹窗：10 个源码确认的 provider key 密码输入、默认 provider、SearXNG 地址、`webSearch.enabled`、workflow；高级项仅提示文件维护。
- `AppShell` 仅增加必要 import/state、紧挨 MCP 的“联网”菜单项和弹窗挂载；未改其他编排逻辑。
- 首次 `npm run typecheck` / `npm run lint` 因一个类型断言换行解析失败；单点修正后第二次两项均通过。
- `git diff -- components/AppShell.tsx` 显示 4 个相邻改动块：import、弹窗状态、菜单项、弹窗挂载。

## 合并前整体验收
- `npm run check`：typecheck 通过、lint 通过；主测试 tests 259 / pass 259，Pi adapter tests 11 / pass 11；合计 270 / pass 270 / fail 0 / skipped 0。
- 相比基线新增 4 个测试（270 ≥ 266），没有跳过或搁置测试，没有放宽断言、伪造被测对象、删除测试或强行吞掉失败。
- 首页真实开发编译：`curl http://127.0.0.1:30151/` → `http_status=200`，响应 32196 字节；服务日志为 `GET / 200`，无客户端引入服务端文件系统错误。
