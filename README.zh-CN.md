# Pi Web

[English](./README.md)

[pi 编程智能体](https://github.com/badlogic/pi-mono) 的本地网页界面。  
本仓库是 [agegr/pi-web](https://github.com/agegr/pi-web) 的维护分支（fork），保留上游归属，并针对本项目做适配层与兼容层改造。

## 快速开始

**推荐方式：克隆本仓库后本地运行**

```bash
git clone https://github.com/ItsDalk-Lane/pi-web.git
cd pi-web
npm install
npm run dev
```

启动后打开 [http://localhost:30141](http://localhost:30141)。命令行版本会在服务就绪后尝试自动打开浏览器。

如果你需要上游已发布的 npm 包，请使用 `@agegr/pi-web`。

**可选参数：**

```bash
pi-web --port 8080              # 自定义端口
pi-web --hostname 127.0.0.1     # 仅本机访问
pi-web -p 8080 -H 127.0.0.1     # 组合使用
pi-web --no-open                # 不自动打开浏览器

PORT=8080 pi-web                # 也支持环境变量
PI_WEB_HOSTNAME=0.0.0.0 pi-web  # 暴露到局域网（仅用于可信网络）
PI_WEB_NO_OPEN=1 pi-web         # 适用于后台服务或开机自启
```

默认会监听在 `127.0.0.1`。如果改为非回环地址，Pi Web 本身没有内置鉴权，请仅在可信网络中使用。

## HTTP 代理

Pi Web 的服务端模型请求和 API 请求会读取标准的 `HTTP_PROXY`、`HTTPS_PROXY` 和 `NO_PROXY` 环境变量。

macOS 或 Linux：

```bash
HTTP_PROXY=http://127.0.0.1:7890 \
HTTPS_PROXY=http://127.0.0.1:7890 \
NO_PROXY=localhost,127.0.0.1 \
npm run dev
```

Windows PowerShell：

```powershell
$env:HTTP_PROXY = "http://127.0.0.1:7890"
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
$env:NO_PROXY = "localhost,127.0.0.1"
npm run dev
```

## 功能介绍

- **把历史工作接回来**：打开网页就能按项目找到以前的 pi 对话，不必在终端里翻文件或记住会话路径。
- **放心试不同方向**：可以从某条历史消息重新开始，也可以复制出一条独立的新路线，探索方案时不怕弄乱原来的对话。
- **跨分支工作**：在侧边栏切换 Git worktree，让新会话和 Explorer 跟随你选择的 checkout。
- **边聊边看项目文件**：左侧浏览项目文件，右侧打开源码、文档、图片、音频和 PDF；文件变化会自动刷新，适合边让 agent 改边检查结果。
- **精确引用文件行号**：在 File Viewer 里选中代码行，可用工具栏按钮或 `Ctrl/Cmd+I` 快捷键插入 `@file:start-end` 引用。
- **Markdown 预览增强**：Mermaid 支持源码/预览切换与放大查看，本地 Markdown 图片链接可直接通过文件 API 渲染。
- **随时掌握会话状态**：在顶部就能看到上下文占用、花费、压缩结果和系统提示，长会话不再像黑箱。
- **少离开当前界面**：模型、登录/API key、模型测试和技能开关都能在网页里处理，配置 agent 时不用在多个工具之间来回切换。
- **持久跟踪任务**：会话现在会同步为可持久化的 Task/Run，并带有事件日志与 Artifact 目录，服务重启后仍可恢复状态。

## 注意事项

- **数据目录**：默认读取 `~/.pi/agent/sessions` 下的会话文件。可通过环境变量 `PI_CODING_AGENT_DIR` 指定其他 pi agent 目录。
- **任务运行时数据库**：持久化的 Task/Run/Artifact/Event 状态保存在 `PI_WEB_DATA_DIR` 指向的位置；未设置时默认使用 `<PI_CODING_AGENT_DIR 或 ~/.pi/agent>/pi-web/kernel.sqlite`。
- **LAN API Token（可选）**：设置 `PI_WEB_LAN_API_TOKEN` 后，非 loopback 的 API 请求必须携带 `Authorization: Bearer <token>` 或 `x-pi-web-token`。
- **会话文件**：路径形如 `~/.pi/agent/sessions/<编码后的工作目录>/<时间戳>_<uuid>.jsonl`。
- **模型配置**：Models 面板读写 pi agent 目录下的 `models.json`，模型列表和默认模型由 pi 的配置解析得到。
- **文件访问**：文件浏览和预览面向当前选择的项目目录，以及会话中已出现过的工作目录。
- **Git worktree**：什么时候显示切换器、新建目录在哪里、删除会影响什么，见 [Pi Web 里的 Worktree](./docs/worktrees.zh-CN.md)。
- **Fork 与会话内分支不同**：Fork 会创建新的 `.jsonl` 文件；“Edit from here” 是同一会话文件里的分支。
- **持久运行时说明**：见 [第三阶段 Durable Task Runtime](./docs/durable-task-runtime-phase-3.md)。
- **通用 Runtime API**：新增 `/api/runtimes`、`/api/capabilities`、`/api/tasks/:id/capabilities`、`/api/tasks/:id/compiled-context`、`/api/tasks/:id/evaluate`、`/api/tasks/:id/complete`、`/api/doctor`，作为能力发现、评估与工作台扩展的基础接口。
- **维护接口**：新增 `POST /api/kernel/backup`（SQLite 快照备份）与 `POST /api/kernel/retention`（按保留策略清理旧事件并保留每任务最近事件底线）。
- **变更请求防护**：任务运行时相关写接口新增 same-origin 校验，提供浏览器场景下的基础 CSRF 防护。

## 开发

```bash
npm install
npm run dev
npm run dev:lan   # 可选：监听局域网
```

本地开发端口为 [http://localhost:30141](http://localhost:30141)。

生产模式运行：

```bash
npm run build
npm run start
npm run start:lan # 可选：监听局域网
```

常用检查：

```bash
npm run typecheck
npm run lint
npm run test
npm run test:persistence
npm run test:task-runtime
npm run test:event-journal
npm run check
```

开发时不要运行 `next build` / `npm run build`，它会写入 `.next/`，容易影响正在运行的 dev server。发布流程再执行构建。

## 上游同步基线记录

- 同步的上游标签：`v0.8.1`
- 上游提交：`678d01243ab4fccf0241280c31d05026efda3b9e`

## 桌面应用（Electron）

本仓库也可以作为桌面应用运行：同一个 Next.js 服务被包进 Electron 窗口。

```bash
npm install
npm run electron:dev    # 先构建一次，再启动桌面应用
npm run electron:start  # 不重新构建，直接再次启动
```

各平台都提供了双击启动器：

- **Windows**：`Pi-Web-Desktop.vbs`（或 `electron\start-windows.bat` / `electron\start-desktop.vbs`）
- **macOS**：`Pi-Web-Desktop.command`（或 `electron/start-macos.command`）。首次打开需右键 →「打开」并确认，以绕过 Gatekeeper。如果文件没有可执行权限（例如不是通过 git 拷贝的），先执行一次 `chmod +x Pi-Web-Desktop.command`。

构建当前平台的安装包：

```bash
npm run electron:build  # Windows 产出 NSIS 安装包,macOS 在 dist-electron/ 产出未签名的 .dmg
```

macOS 的 `.dmg` 未签名（不需要 Apple 开发者账号）。首次启动时在「系统设置 → 隐私与安全性」中允许即可。

## 项目结构

```
app/
  api/
    agent/          # 创建/驱动 AgentSession，提供 SSE 事件流
    auth/           # OAuth 和 API key 管理
    cwd/validate/   # 自定义工作目录校验
    default-cwd/    # 获取 pi 默认工作目录
    files/          # 文件列表、读取、预览、watch
    home/           # 当前用户 home 目录
    models/         # 可用模型、默认模型、thinking levels
    models-config/  # 读写 models.json、测试模型
    sessions/       # 会话读取、重命名、删除、上下文、HTML 导出
    skills/         # skills 列表、搜索、安装、启停
    tasks/          # 持久 Task、Run、Event、Artifact API
components/
  AppShell.tsx        # 主布局、URL 状态、顶部面板、文件标签
  SessionSidebar.tsx  # 项目选择、会话树、Explorer
  ChatWindow.tsx      # 消息区、SSE、拖拽图片、minimap
  ChatInput.tsx       # 输入栏、模型/工具/thinking/compact/slash controls
  MessageView.tsx     # 消息、thinking、tool call/result 渲染
  ModelsConfig.tsx    # 模型和认证配置面板
  SkillsConfig.tsx    # 技能管理面板
  FileExplorer.tsx    # 文件树
  FileViewer.tsx      # 源码、diff、图片、音频、PDF、DOCX 预览
lib/
  application/      # task/run/artifact/event 服务与端口
  persistence/      # SQLite 数据库、仓储、迁移与数据目录逻辑
  http-dispatcher.ts  # 服务端 fetch 的 HTTP(S) 代理配置
  rpc-manager.ts      # AgentSessionWrapper 生命周期和全局 registry
  session-reader.ts   # 解析 .jsonl 会话文件和分支上下文
  normalize.ts        # 规范化 toolCall 字段名
  file-access.ts      # 文件读取安全边界
  file-paths.ts       # 文件路径编码/相对路径工具
  markdown.ts         # Markdown/Mermaid/KaTeX 插件配置
  pi-types.ts         # pi 相关类型
hooks/
  useAgentSession.ts  # 会话加载、发送命令、SSE 状态机
  useAudio.ts         # 完成提示音
  useDragDrop.ts      # 图片拖拽
  useTheme.ts         # 主题切换
bin/
  pi-web.js           # npm CLI 入口
instrumentation.ts    # 初始化服务端 HTTP dispatcher
```
