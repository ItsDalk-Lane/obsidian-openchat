# v0.8.1 上游同步方案（仅分析）

> 仓库：`ItsDalk-Lane/pi-web`（fork 自 `agegr/pi-web`）  
> 分析时间：2026-07-26  
> 范围：上游 `baseline..v0.8.1`，并对照本 fork `baseline..HEAD`

---

## 1) 上游数据准备结果

- 已确认并配置 `upstream`：`https://github.com/agegr/pi-web.git`
- 已执行：`git fetch upstream --tags --force`
- 已确认 tag 存在：`v0.8.1` -> `678d01243ab4fccf0241280c31d05026efda3b9e`
- 已拉取 release 信息：
  - `gh release view v0.8.1 --repo agegr/pi-web`
  - `gh release list --repo agegr/pi-web --limit 10`

---

## 2) 本 fork 的上游基线判定

- `git merge-base HEAD upstream/main` = `0d1d0d1a36dd8a4ead77648ad2fc18e2b1291e55`
- 该基线可描述为：`v0.8.0-3-g0d1d0d1`（即在 `v0.8.0` 之后 3 个上游提交点）
- 结论：本 fork 并非直接从 `v0.8.0` 切出，而是同步到了更后的上游点（含 `streamFn key` 修复）

---

## 3) 两份 diff 与高风险交集

### A. 上游增量（`baseline..upstream/v0.8.1`）

- 变更规模：`66 files changed, 2984 insertions(+), 921 deletions(-)`

### B. 本 fork 自有改动（`baseline..HEAD`）

- 变更规模：`70 files changed, 8126 insertions(+), 3640 deletions(-)`

### A ∩ B 文件交集（冲突高危区）

1. `README.md`
2. `README.zh-CN.md`
3. `package.json`
4. `package-lock.json`
5. `app/api/plugins/route.ts`
6. `app/globals.css`
7. `components/AppShell.tsx`
8. `components/ChatInput.tsx`
9. `components/ChatWindow.tsx`
10. `components/FileViewer.tsx`
11. `components/MessageView.tsx`
12. `components/SessionSidebar.tsx`
13. `hooks/useAgentSession.ts`
14. `lib/rpc-manager.ts`
15. `lib/session-reader.ts`
16. `lib/bash-output.test.mjs`
17. `lib/file-dirent.test.mjs`
18. `lib/file-upload.test.mjs`

---

## 4) 变更清单（分类+策略）

| # | 上游改动 | 涉及文件 | 与 fork 冲突? | 处理策略 | 风险 |
|---|---|---|---|---|---|
| 1 | 本地 API/文件系统安全加固（Origin 校验、路径真实路径校验、上传体积限制、图片附件限制） | `proxy.ts`, `lib/request-security.ts`, `lib/path-security.ts`, `lib/file-access.ts`, `lib/bounded-form-data.ts`, `lib/image-attachments.ts`, `app/api/files/[...path]/route.ts`, `app/api/git/*`, `app/api/skills/*`, `app/api/models/route.ts`, `app/api/plugins/route.ts`, `app/api/worktrees/route.ts`, `app/api/file-index/route.ts` | 是（`app/api/plugins/route.ts` 已被 fork 深改） | 【需要适配】先引入底层安全工具与 `proxy.ts`，再逐路由合并；`plugins` 路由需把 fork 的 npm 预检/中文错误提示与上游 Access-denied gate 同时保留 | 高 |
| 2 | 新增可浏览目录选择器（后端路由+前端弹窗） | `app/api/cwd/browse/route.ts`, `lib/directory-browser.ts`, `components/DirectoryPicker.tsx`, `components/SessionSidebar.tsx`, `app/globals.css` | 是（`SessionSidebar` 已大量中文化且有桌面逻辑） | 【需要适配】采用上游后端路由与目录工具；前端在 fork 的 `SessionSidebar` 中按现有中文/桌面交互做“并行入口”整合，不直接覆盖 | 中 |
| 3 | 输入增强：历史回溯（↑）、发送失败恢复输入、新会话并发 key 防碰撞 | `components/ChatInput.tsx`, `components/ChatWindow.tsx`, `hooks/useAgentSession.ts`, `app/api/agent/new/route.ts` | 是 | 【需要适配】按功能块拆合并：先 `randomUUID` 新会话 key，再补 `prompt` 失败回填，再接入历史菜单；保持 fork 中文文案与现有快捷键 | 高 |
| 4 | 文件行引用（Cmd/Ctrl+I）与 `@file:line-range` mention | `components/FileViewer.tsx`, `components/AppShell.tsx`, `lib/file-fuzzy.ts` | 是 | 【需要适配】引入 `buildFileLineMentionText` 与选区行号逻辑；在 fork 的右侧文件面板开关逻辑下验证是否仍可插入 mention | 中 |
| 5 | Markdown 体验增强：图片预览、KaTeX、Mermaid 预览/缩放 | `components/FileViewer.tsx`, `components/MarkdownBody.tsx`, `components/MermaidBlock.tsx`, `lib/markdown.ts`, `app/globals.css` | 是 | 【需要适配】优先引入 `MermaidBlock` 与 `markdown` 处理函数，再合并 `FileViewer/MarkdownBody` 的渲染入口；保留 fork 现有中文 UI 词汇 | 高 |
| 6 | 会话侧边栏一致性修复（后台完成后刷新、运行态展示修正） | `components/SessionSidebar.tsx`, `lib/session-reader.ts` | 是 | 【需要适配】上游修复点与 fork 现有会话树/worktree 扩展紧耦合，需手工合并；优先确保后台结束后自动刷新行为 | 中 |
| 7 | 会话压缩中间态下消息折叠修复（compaction 作为锚点） | `components/ChatWindow.tsx` | 是 | 【需要适配】将 `isGroupAnchor` 及 live-tail 判断逻辑并入 fork 的 `ChatWindow`，避免压缩后消息“散开不折叠” | 中 |
| 8 | 模型错误可见化与模型切换可靠性（`modelError` + set_model refresh） | `app/api/models/route.ts`, `hooks/useAgentSession.ts`, `components/ChatInput.tsx`, `lib/rpc-manager.ts`, `lib/models-cache.ts` | 是（UI/Hook/RPC 都在交集） | 【需要适配】后端先返回 `modelError`，前端补 banner；`set_model` 走 miss->refresh->retry；与 fork 的 adapter 层实现统一 | 高 |
| 9 | `rpc-manager` 图像附件校验（prompt/steer/follow_up） | `lib/rpc-manager.ts`, `lib/image-attachments.ts` | 是（fork 的 `rpc-manager` 已重构） | 【冲突需决策】方案A：在 `rpc-manager.send` 直接加校验（贴近上游）；方案B：下沉到 fork `lib/adapters/pi` 统一校验（更符合 fork 架构）。需你拍板 | 高 |
| 10 | CLI/启动行为：默认 loopback、`PI_WEB_HOSTNAME`、Node 最低版本检查 | `bin/pi-web.js`, `bin/pi-web-options.js`, `bin/node-version.js`, `package.json` | 否（bin 文件 fork 未改） | 【直接采纳】可直接移植，但需与 fork 现有 Electron 启动脚本做联调（见“人工确认”） | 中 |
| 11 | Pi 依赖升级至 `0.82.1` | `package.json`, `package-lock.json` | 是（fork 当前为 `0.82.0` 且有额外依赖） | 【需要适配】仅升级四个 `@earendil-works/pi-*` 版本，不覆盖 fork 的 Electron/MCP 依赖与脚本；`lockfile` 需重解 | 高 |
| 12 | 会话路径大小写/规范化修复（Windows 更关键） | `lib/session-path.ts`, `lib/session-reader.ts`, `app/api/sessions/[id]/route.ts` | 是（`session-reader.ts` 交集） | 【需要适配】`sessionPathKey` 建议整体引入；与 fork 已有 `getSessionCwd` 等扩展合并 | 中 |
| 13 | README 增补（Node 要求、默认监听地址、安全提示）+ 新增日文 README | `README.md`, `README.zh-CN.md`, `README.ja.md` | 是（README 双语已被 fork 改写） | 【需要适配】保留 fork “这是维护分支”叙述，合并上游安全与参数说明；`README.ja.md` 可【直接采纳】 | 低 |
| 14 | 测试更新（symlink 场景健壮性、新安全模块测试） | 多个 `*.test.mjs` | 部分是（3 个测试文件在交集） | 【需要适配】交集测试保留 fork 的 EPERM 兼容处理；新增安全模块测试可整体采纳 | 低 |
| 15 | `app/api/plugins` 路由新增 cwd 访问门禁 | `app/api/plugins/route.ts` | 是（fork 同文件已有大量自定义安装前校验） | 【需要适配】在现有逻辑入口统一加 allowed-root 校验，避免漏分支；保持当前中文错误信息 | 中 |
| 16 | `proxy.ts` 对 `/api/*` 跨源请求拒绝 | `proxy.ts` | 否（fork 尚无该文件） | 【需要适配】建议采纳；但 Electron/桌面封装下是否出现非同源请求需先做回归，暂标「需要人工确认」 | 中 |

---

## 5) 重点核查项（逐条）

### 5.1 `package.json`（依赖/脚本/peerDeps）

上游 `v0.8.1` 相对基线的关键变化：

- 新增 `engines.node >=22.19.0`
- script 变化：
  - `dev/start` 默认加 `-H 127.0.0.1`
  - 新增 `dev:lan` / `start:lan`
- pi 相关依赖统一从 `0.81.1` 升到 `0.82.1`
- 未看到新增 `peerDependencies`

fork 当前状态：

- `name/version/private/bin/release` 已是 fork 自定义，且有 Electron 构建链、MCP 依赖、额外检查脚本
- pi 依赖目前为 `0.82.0`

同步建议：

1. **保留** fork 的 `name/version/bin/private/release/build/electron` 等自定义字段（不要整文件覆盖）
2. 精准吸收上游：
   - `engines.node`
   - `PI_WEB_HOSTNAME` 相关脚本策略（与 fork 当前脚本融合）
   - 四个 pi 依赖升级到 `0.82.1`
3. `package-lock.json` 必须重解并完整校验

> 需要人工确认：fork 是否仍需保留 `version: 0.8.0`（内部版本策略）或跟随到 `0.8.1+fork`。

---

### 5.2 `app/api/**` 契约变化与前端调用面

新增路由：

- `GET /api/cwd/browse?path=...`
  - 返回：`{ path, parentPath, directories[] }` / 错误

已有路由行为变化（以安全门禁为主）：

- `/api/files`：上传限制（单文件 25MB，总 100MB，请求体限制），新增 `413`
- `/api/git/status` `/api/git/diff` `/api/models` `/api/plugins` `/api/skills*` `/api/worktrees` `/api/file-index`：路径存在性与 allowed-root 校验强化，可能新增 `403`
- `/api/models`：新增 `modelError` 字段（用于前端展示）
- `/api/agent/new`：并发创建 key 改为 UUID 防碰撞
- `/api/sessions/[id]`：删除时 parentSession 重挂接采用 path key 比较（Windows 兼容）

前端调用点影响：

- fork 前端已广泛调用 `/api/files`、`/api/git/*`、`/api/plugins`、`/api/skills*`、`/api/worktrees`
- 若采纳上游安全门禁，前端需兼容新增 `403/413`（当前大多只展示通用错误，建议补具体提示）
- 若采纳 `modelError`，需同步 `useAgentSession` + `ChatInput` 展示链路

---

### 5.3 `lib/rpc-manager.ts` 与 AgentSession / SSE 事件流

上游 v0.8.1 直接改动点：

- 在 `prompt/steer/follow_up` 前做图片附件校验
- `set_model` 失败时 `modelRuntime.refresh({ allowNetwork: false })` 后重试

fork 实际情况：

- `lib/rpc-manager.ts` 已做大规模 adapter 化重构（`createPiSession/normalizePiEvent/mcp_status` 等）
- 上游这两处修复未直接存在于 fork 当前实现

结论：

- 不能直接套 patch，需在 fork 的 adapter 体系下重做等价逻辑
- 事件流方面，上游“compaction 旧事件名兼容”在 fork 已通过 adapter 思路处理（已具备部分能力）

---

### 5.4 `bin/pi-web.js` CLI 参数与环境变量

上游新增/调整：

- 启动前 Node 版本检查（`bin/node-version.js`）
- hostname 默认值从 `HOSTNAME/null` 改为 `PI_WEB_HOSTNAME/127.0.0.1`
- 非 loopback 监听时打印安全警告
- URL 生成与 Next 启动参数统一强制携带 hostname

fork 状态：

- `bin/*` 当前未见 fork 自有改动，冲突低

建议：

- 可优先直接采纳；同时验证 Electron 启动链（`electron/launcher.js`）是否受 loopback 默认值影响

---

### 5.5 配置格式变化（`models.json`、`~/.pi/agent`）

- 在 `v0.8.1` diff 中**未看到** `models.json` 文件结构变更或 `~/.pi/agent` 目录迁移脚本
- 主要是读取/错误展示/runtime 刷新时机调整

> 需要人工确认：pi 依赖从 `0.82.0 -> 0.82.1` 后，底层 SDK 是否隐式引入配置语义变更（建议在真实用户目录做一次读写回归）。

---

### 5.6 新增 UI 文案（i18n/中文化补译点）

若采纳上游新功能，以下新增文案需补翻译（fork 已中文化）：

1. `components/DirectoryPicker.tsx`：目录选择弹窗全套文案（Select directory/Go/No subdirectories/...）
2. `components/ChatInput.tsx`：
   - `ModelErrorBanner`（Model error）
   - 输入历史菜单（Input history）
   - 模型空状态（No available models/Select model）
3. `components/FileViewer.tsx`：`Mention selected lines` 相关 tooltip
4. `components/MermaidBlock.tsx`：
   - Preview/Source
   - Mermaid diagram viewer/Zoom in/out/Fit to width/Close
   - Invalid Mermaid diagram 等
5. `README.ja.md`（新增日文文档，中文文案不受影响，但文档导航需保持多语一致）

---

### 5.7 `README.md` / `AGENTS.md` / `.github/workflows`

- 上游 `v0.8.1`：
  - `README.md`、`README.zh-CN.md` 有更新
  - 新增 `README.ja.md`
  - **未发现** `AGENTS.md` 或 `.github/workflows/*` 变更
- fork 当前：
  - `AGENTS.md` 与 CI workflow 已有大量 fork 自定义内容

结论：

- 本次只需处理 README 系列同步
- `AGENTS.md` / workflow 不存在上游 v0.8.1 增量可并入

---

## 6) 推荐同步方式

### 推荐：**逐文件（分专题）cherry-pick / 手工移植**，不建议直接 merge tag 或整体 rebase

理由：

1. 交集高危文件多（18 个），且集中在 `rpc-manager`、聊天 UI、侧边栏、`package.json` 等 fork 强改区域
2. fork 含上游没有的架构与能力（Pi adapter 重构、MCP UI、Electron、中文化），直接 merge/rebase 冲突面大且容易“语义误合”
3. 上游 v0.8.1 大部分是可拆分功能块（安全、目录浏览、markdown、输入体验），适合按主题渐进引入

---

## 7) 建议执行顺序（含依赖）

1. **基础安全层（后端）**
   - 引入 `proxy.ts`、`request-security`、`path-security`、`bounded-form-data`、`image-attachments`
2. **API 门禁与上传限制**
   - 合并 `/api/files`、`/api/git/*`、`/api/models`、`/api/plugins`、`/api/skills*`、`/api/worktrees`、`/api/file-index`
3. **会话与运行时稳定性**
   - `app/api/agent/new` UUID key
   - `session-path` + `session-reader` + `sessions/[id]` 修复
   - `rpc-manager` 的 set_model refresh / 图片校验（按 adapter 架构实现）
4. **模型错误可见化链路**
   - `/api/models` -> `useAgentSession` -> `ChatInput`（含 banner）
5. **输入体验增强**
   - 发送失败恢复、输入历史、行号 mention
6. **Markdown / FileViewer 增强**
   - Mermaid/KaTeX/图片预览与样式
7. **目录选择器功能**
   - `/api/cwd/browse` + `DirectoryPicker` + `SessionSidebar` 集成
8. **CLI 与依赖升级**
   - `bin/*` + `package.json`（pi 0.82.1 / engines / host 参数）
9. **文档同步**
   - README EN/ZH + 新增 JA

---

## 8) 同步后必须人工验证的回归清单（结合 fork 自有特性）

1. **MCP 特性回归（fork 核心）**
   - MCP 配置 UI 可正常读写、启停、状态刷新
   - `mcp_status` SSE 不受上游改动影响
2. **Pi adapter 兼容回归**
   - `compaction_start/end`、toolCall 归一化、模型切换、会话 fork/branch 全链路正常
3. **安全门禁回归**
   - 同源请求正常，跨源请求被拒绝（含 LAN 模式）
   - 非允许目录访问返回 403；合法目录不误杀
4. **文件上传回归**
   - 小文件上传正常；超限返回明确 413 提示
5. **会话列表/侧边栏回归**
   - 新会话流式阶段可见
   - 后台完成后自动刷新
   - worktree 删除/切换逻辑无回归
6. **输入体验回归**
   - 发送失败后输入可恢复
   - ↑ 历史回溯可用
   - 文件行选择 + Cmd/Ctrl+I mention 正常
7. **Markdown/预览回归**
   - Mermaid 渲染与缩放
   - KaTeX 行间公式
   - 本地图片链接预览
8. **Electron 桌面回归（fork 独有）**
   - 启动、刷新、目录选择、API 请求全部正常
   - 默认 loopback/Origin 校验不与桌面壳冲突（**需要人工确认**）
9. **Node/依赖回归**
   - 在 Node `22.19+` 正常
   - `npm ci` + `typecheck` + `lint` + `test` + `test:pi-adapter` 通过
10. **多语言文案回归**
    - 新增功能文案无英文漏网、无乱码

---

## 9) 结论（可执行建议）

- 本次不建议“整仓快进同步”；建议按上文顺序分批引入。
- 第一优先级：**安全补丁 + 会话/模型稳定性补丁**。
- 第二优先级：**输入/Markdown/目录选择器体验增强**。
- 执行时请以“fork 架构保持”为前提，尤其 `lib/rpc-manager.ts` 与 `components/*` 中文化 UI。

