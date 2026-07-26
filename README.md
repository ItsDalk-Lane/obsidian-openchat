# Pi Web

[中文文档](./README.zh-CN.md)

Local web UI for the [pi coding agent](https://github.com/badlogic/pi-mono).  
This repository is a maintained fork of [agegr/pi-web](https://github.com/agegr/pi-web), and keeps upstream attribution while focusing on project-specific adapter and compatibility work.

![Pi Web shows the same pi session with structured Markdown, tool calls, and project navigation beside the CLI](https://raw.githubusercontent.com/agegr/pi-web/main/docs/screenshot2.png)

The same pi session in CLI and Pi Web: structured tool calls, readable Markdown, session browsing, and cleaner results.

## Quick Start

**Clone and run locally (recommended for this fork):**

```bash
git clone https://github.com/ItsDalk-Lane/pi-web.git
cd pi-web
npm install
npm run dev
```

Then open [http://localhost:30141](http://localhost:30141). The CLI will try to open the browser automatically after the server is ready.

If you need the upstream published package, use `@agegr/pi-web` instead of this fork.

**Options:**

```bash
pi-web --port 8080              # custom port
pi-web --hostname 127.0.0.1     # local access only
pi-web -p 8080 -H 127.0.0.1     # combine options
pi-web --no-open                # do not open the browser automatically

PORT=8080 pi-web                # environment variable is also supported
PI_WEB_HOSTNAME=0.0.0.0 pi-web  # expose to LAN (use only on trusted networks)
PI_WEB_NO_OPEN=1 pi-web         # useful when running as a background service
```

By default the server binds to `127.0.0.1`. If you bind to non-loopback addresses, Pi Web has no built-in authentication, so restrict it to trusted networks.

## HTTP Proxy

Pi Web reads the standard `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` environment variables for server-side model and API requests.

On macOS or Linux:

```bash
HTTP_PROXY=http://127.0.0.1:7890 \
HTTPS_PROXY=http://127.0.0.1:7890 \
NO_PROXY=localhost,127.0.0.1 \
npm run dev
```

On Windows PowerShell:

```powershell
$env:HTTP_PROXY = "http://127.0.0.1:7890"
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
$env:NO_PROXY = "localhost,127.0.0.1"
npm run dev
```

## Features

- **Pick work back up**: browse previous pi conversations by project without digging through terminal history or session paths.
- **Try different directions safely**: continue from an earlier message or fork a session into a separate route.
- **Work across branches**: switch Git worktrees from the sidebar so new sessions and the Explorer follow the checkout you choose.
- **Chat beside the project**: browse files on the left and preview source, docs, images, audio, and PDFs on the right while the agent works.
- **Reference exact file lines**: select lines in File Viewer and use the toolbar button or `Ctrl/Cmd+I` to insert `@file:start-end` mentions into chat.
- **Better Markdown rendering**: Mermaid diagrams support source/preview switching and zoom viewer; local markdown image links render directly from the file API.
- **See session state clearly**: context usage, cost, compaction state, and system prompt details are visible from the top bar.
- **Configure less from the terminal**: manage models, login/API keys, model tests, and skill switches from the web UI.
- **Track durable work**: sessions now reconcile into persistent Tasks/Runs with an event journal and artifact catalog that survive server restarts.

## Notes

- **Data directory**: Pi Web reads `~/.pi/agent/sessions` by default. Set `PI_CODING_AGENT_DIR` to point at another pi agent directory.
- **Task runtime database**: Pi Web stores durable task/run/artifact/event state in `PI_WEB_DATA_DIR`, or by default in `<PI_CODING_AGENT_DIR or ~/.pi/agent>/pi-web/kernel.sqlite`.
- **Session files**: files are stored as `~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`.
- **Model config**: the Models panel reads and writes `models.json` in the pi agent directory. Model lists and defaults come from pi's config.
- **File access**: file browsing and preview are scoped to the selected project directory and working directories that appear in sessions.
- **Git worktrees**: see [Worktrees in Pi Web](./docs/worktrees.md) for when the switcher appears, how new worktrees are created, and what removal does.
- **Forks vs in-session branches**: Fork creates a new `.jsonl` file. "Edit from here" creates another branch inside the same session file.
- **Durable runtime details**: see [Durable Task Runtime - Phase 3](./docs/durable-task-runtime-phase-3.md).

## Development

```bash
npm install
npm run dev
npm run dev:lan   # optional LAN binding
```

The local dev server runs at [http://localhost:30141](http://localhost:30141).

Production run:

```bash
npm run build
npm run start
npm run start:lan # optional LAN binding
```

Common checks:

```bash
npm run typecheck
npm run lint
npm run test
npm run test:persistence
npm run test:task-runtime
npm run test:event-journal
npm run check
```

Avoid running `next build` / `npm run build` during local development. It writes to `.next/` and can interfere with the dev server; leave builds for release work.

## Upstream Sync Reference

- Synced upstream tag: `v0.8.1`
- Upstream commit: `678d01243ab4fccf0241280c31d05026efda3b9e`

## Desktop App (Electron)

The repo can also run as a desktop app that bundles the same Next.js server in an Electron window.

```bash
npm install
npm run electron:dev    # build once, then launch the desktop app
npm run electron:start  # relaunch without rebuilding
```

Double-click launchers are provided per platform:

- **Windows**: `Pi-Web-Desktop.vbs` (or `electron\start-windows.bat` / `electron\start-desktop.vbs`)
- **macOS**: `Pi-Web-Desktop.command` (or `electron/start-macos.command`). The first time, right-click → **Open** and confirm to bypass Gatekeeper. If the file is not executable (e.g. copied without git), run `chmod +x Pi-Web-Desktop.command` once.

To build an installer for the current platform:

```bash
npm run electron:build  # Windows: NSIS installer, macOS: unsigned .dmg in dist-electron/
```

The macOS `.dmg` is unsigned (no Apple Developer account required). On first launch, allow it under **System Settings → Privacy & Security**.

## Project Structure

```text
app/
  api/
    agent/          # creates/drives AgentSession and exposes SSE events
    auth/           # OAuth and API key management
    cwd/validate/   # custom working directory validation
    default-cwd/    # pi default working directory lookup
    files/          # file listing, reading, preview, and watching
    home/           # current user home directory
    models/         # available models, default model, thinking levels
    models-config/  # read/write models.json and test models
    sessions/       # session reads, rename, delete, context, HTML export
    skills/         # skill listing, search, install, enable/disable
    tasks/          # durable task, run, event, and artifact APIs
components/
  AppShell.tsx        # main layout, URL state, top panels, file tabs
  SessionSidebar.tsx  # project selector, session tree, Explorer
  ChatWindow.tsx      # messages, SSE, image drag/drop, minimap
  ChatInput.tsx       # input bar, model/tools/thinking/compact/slash controls
  MessageView.tsx     # message, thinking, tool call/result rendering
  ModelsConfig.tsx    # model and auth configuration panel
  SkillsConfig.tsx    # skill management panel
  FileExplorer.tsx    # file tree
  FileViewer.tsx      # source, diff, image, audio, PDF, DOCX preview
lib/
  application/      # task/run/artifact/event services and ports
  persistence/      # SQLite database, repositories, migrations, data-dir logic
  http-dispatcher.ts  # HTTP(S) proxy setup for server-side fetch
  rpc-manager.ts      # AgentSessionWrapper lifecycle and global registry
  session-reader.ts   # parses .jsonl session files and branch contexts
  normalize.ts        # normalizes toolCall field names
  file-access.ts      # file read safety boundary
  file-paths.ts       # path encoding and relative path helpers
  markdown.ts         # Markdown/Mermaid/KaTeX plugin configuration
  pi-types.ts         # pi-related types
hooks/
  useAgentSession.ts  # session loading, command sending, SSE state machine
  useAudio.ts         # completion sound
  useDragDrop.ts      # image drag/drop
  useTheme.ts         # theme switching
bin/
  pi-web.js           # npm CLI entrypoint
instrumentation.ts    # initializes the server HTTP dispatcher
```
