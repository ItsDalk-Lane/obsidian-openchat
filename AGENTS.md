# Pi Web - Development Notes

## Quick Start

```bash
npm run dev   # port 30141
```

Typecheck: `node_modules/.bin/tsc --noEmit`  
Lint: `npm run lint`  
**Never run `next build` during dev** — pollutes `.next/` and breaks `npm run dev`.

## Releasing the Desktop App

- Version numbers must be **plain semver** (`0.8.2`, not `0.8.1-fork.0`) — prerelease-style versions make electron-updater derive a bogus update channel.
- Release flow:
  1. Bump `"version"` in `package.json` and commit.
  2. `git tag v<version> && git push origin v<version>`
  3. `.github/workflows/release.yml` builds the NSIS installer on `windows-latest` and publishes it to GitHub Releases (uses the built-in `GITHUB_TOKEN`, no secrets to configure).
- Packaged clients check GitHub Releases ~15s after startup, download in the background, and prompt to restart when ready. 帮助 → 检查更新 triggers a manual check with feedback dialogs.
- Local fallback: `GH_TOKEN=<token> npm run release:win` (or `release:mac` on macOS) publishes from your machine.
- The app is unsigned, so Windows SmartScreen will warn on install/update — expected.
- macOS: the workflow's `build-macos` job produces a universal (arm64 + x64) DMG. It is intentionally **unsigned** (`identity: null`), so:
  - first launch requires right-click → 打开 (or `xattr -dr com.apple.quarantine /Applications/Pi\ Web\ Desktop.app`);
  - **macOS auto-update does not work without a code signature** (Squirrel.Mac requirement) — Mac users update by downloading the new DMG from Releases manually. Windows clients auto-update normally. Enabling Mac auto-update later requires an Apple Developer account ($99/yr) + signing/notarization secrets in CI.
- The macOS job runs after the Windows job (`needs:`) because concurrent electron-builder publishes to the same Release can create duplicate draft releases.

---

## Architecture

```
Browser                Next.js Server              AgentSession (in-process)
  │                        │                               │
  ├─ GET /api/sessions ────▶ reads ~/.pi/agent/sessions/   │
  ├─ GET /api/sessions/[id] reads .jsonl file directly     │
  ├─ GET /api/agent/running/events ───▶ running id SSE     │
  │                        │                               │
  ├─ send message ─────────▶ POST /api/agent/[id]          │
  │                        │   startRpcSession() ─────────▶│ createAgentSession()
  │                        │   session.send(cmd) ─────────▶│ session.prompt()
  │                        │                               │
  ├─ SSE connect ──────────▶ GET /api/agent/[id]/events    │
  │                        │   session.onEvent() ◀─────────│ session.subscribe()
  │◀── data: {...} ─────────│                               │
```

## Phase 2 Kernel Baseline (General Agent Kernel)

- `lib/kernel/**` now defines shared, runtime-agnostic domain/protocol primitives:
  - `Task`, `Run`, `Artifact`, `WorkspaceView`
  - `RuntimeCommand` discriminated union
  - `KernelEvent` v1 envelope + decoder/factory
- `lib/kernel/**` must stay free of:
  - Pi SDK imports
  - React / Next.js imports
  - Node-only modules (`fs`, `path`, `crypto`, etc.)
- Pi-specific mapping remains in `lib/adapters/pi/**`:
  - Session projection: `SessionInfo -> Task + default Run`
  - Native event translation: `Pi event -> KernelEvent`
- Branch semantics remain unchanged:
  - **Fork** creates a new session file and now projects to a new Task with `parentTaskId`
  - **In-session branch** (`navigate_tree`) stays in the same Task/Run
- `agent_end` is **operation-level completion**, not Task completion.
  - Task persistence/completion workflows are intentionally out of scope for this phase.
- File viewing is now Artifact-based:
  - `filePath -> Artifact` via `lib/artifacts/file-artifact.ts`
  - UI selection uses renderer registry (`components/artifacts/*`)
  - `FileViewer` remains the backward-compatible entry point.
- Workbench model is generalized:
  - tabs use `WorkbenchTab` (`artifact` or `view`) instead of hard-coding `filePath`
  - chat/file panes keep current layout; wrappers (`ChatWorkspaceView`, `ArtifactWorkspaceView`) provide view boundaries.

**Session browsing** (read-only): reads `.jsonl` files through SDK `SessionManager` helpers and `lib/session-reader.ts` — no AgentSession created.  
**Sending a message**: `startRpcSession()` in `lib/rpc-manager.ts` creates an AgentSession in-process.

## Phase 3 Durable Runtime Baseline

- Persistent local runtime state now lives in SQLite under:
  - `PI_WEB_DATA_DIR`, or
  - `<PI_CODING_AGENT_DIR or ~/.pi/agent>/pi-web/kernel.sqlite`
- Keep the layering strict:
  - `lib/kernel/**`: pure domain/protocol types only
  - `lib/application/**`: ports + services using kernel types
  - `lib/persistence/**`: SQLite adapters only, never imported by client code
- `app/api/tasks/**` is now the durable task surface:
  - `/api/tasks/resolve` maps `runtimeKind + nativeRuntimeId` to persistent Task/Run
  - `/api/tasks/[taskId]` accepts only durable `TaskId`
- `PiSessionReconciler` is the only place that should import/sync Pi sessions into persistent Task/Run state.
- `AppShell` must resolve active Task/Run through the task API, not via client-side `projectPiSession()`.
- Event durability split:
  - Journal durable task/run/artifact/operation/capability/compaction/retry events
  - Do not persist streaming token/message bodies by default
- Service restart rule:
  - any persisted `running` run without a live in-memory runtime becomes `interrupted`
  - do not auto-replay prompts or tools

---

## File Map

```
app/api/
  sessions/route.ts               GET  list all sessions
  sessions/[id]/route.ts          GET/PATCH/DELETE session
  sessions/[id]/context/route.ts  GET ?leafId= — context for a specific leaf
  sessions/[id]/export/route.ts   GET exported HTML for a session
  agent/new/route.ts              POST { cwd, message, toolNames?, provider?, modelId? }
  agent/[id]/route.ts             GET state | POST any command
  agent/[id]/events/route.ts      GET SSE stream
  agent/running/events/route.ts   GET SSE stream of currently-running session ids
  auth/all-providers/route.ts     GET API-key provider list
  auth/api-key/[provider]/route.ts GET/POST/DELETE provider API key status/storage
  auth/login/[provider]/route.ts  GET OAuth/device-code SSE | POST manual code
  auth/logout/[provider]/route.ts POST OAuth logout
  auth/providers/route.ts         GET OAuth provider list
  cwd/validate/route.ts           POST validate/select a cwd
  default-cwd/route.ts            POST create ~/pi-cwd-YYYYMMDD
  files/[...path]/route.ts        GET file contents for viewer
  home/route.ts                   GET user home directory
  mcp/route.ts                    GET list servers | POST upsert/remove | PATCH enable/disable
  mcp/status/route.ts             GET ?sessionId= — live MCP status snapshot for a session
  models/route.ts                 GET { models, modelList, defaultModel }
  models-config/route.ts          GET/PUT — read/write ~/.pi/agent/models.json
  models-config/test/route.ts     POST test a configured model/provider
  plugins/route.ts                GET/POST package plugin management
  skills/route.ts                 GET/PATCH loaded skills and disable-model-invocation
  skills/install/route.ts         POST install skills through npx skills add
  skills/search/route.ts          GET/POST skills.sh search
  worktrees/route.ts              GET/POST/DELETE git worktrees

lib/
  adapters/pi/        Pi runtime boundary (session/event/message/compat adapters)
  agent-client.ts      typed fetch helper for /api/agent commands
  draft-store.ts       local draft persistence helpers
  file-access.ts       allowed file roots for /api/files and worktrees
  file-paths.ts        client/server path encoding helpers
  markdown.ts          shared markdown helpers
  mcp-config.ts        MCP config file merge/read/write (6-layer precedence, mask/unmask secrets)
  mcp-extension.ts     bundled pi-mcp-adapter path resolution + status event constants/types
  npx.ts               npx runner used by skill install
  pi-types.ts          local structural types for pi SDK objects
  rpc-manager.ts      AgentSessionWrapper + registry + startRpcSession
  session-reader.ts   SessionManager wrappers + path cache + buildSessionContext adapter
  tool-presets.ts     PRESET_NONE/DEFAULT/FULL + getPresetFromTools()
  types.ts            shared TypeScript types
  normalize.ts        normalizeToolCalls() thin wrapper over PiMessageAdapter
  worktree.ts         project/worktree resolution and git worktree operations

components/
  AppShell.tsx        layout + URL state + tab management
  SessionSidebar.tsx  session tree + FileExplorer
  ChatWindow.tsx      chat composition + completion sound wrapper
  ChatInput.tsx       input bar + model/thinking/tools/compact controls
  MessageView.tsx     renders one message (user/assistant/toolCall/toolResult)
  BranchNavigator.tsx in-session branch switcher
  ChatMinimap.tsx     scroll minimap alongside the message list
  MarkdownBody.tsx    markdown renderer
  ModelsConfig.tsx    modal for editing models.json (opened from sidebar bottom)
  PluginsConfig.tsx   modal for installed package plugins
  SkillsConfig.tsx    modal for loaded/search/installable skills
  McpConfig.tsx       modal for MCP servers (list/status/toggle/add/edit/remove)
  FileExplorer.tsx    file tree inside sidebar
  FileIcons.tsx       file icon helpers
  FileViewer.tsx      file content in a tab
  TabBar.tsx          tab bar (Chat + open file tabs)

hooks/
  useAgentSession.ts  messages + streaming + SSE + fork/navigate/reconciliation logic
  useAudio.ts         completion sound + browser AudioContext unlock
  useDragDrop.ts      shared drag/drop state
  useIsMobile.ts      responsive breakpoint hook
  useTheme.ts         theme state
```

---

## Key Design Decisions & Traps

### AgentSession lifecycle (`lib/rpc-manager.ts`)
- One `AgentSessionWrapper` per session id, keyed in `globalThis.__piSessions`
- `globalThis` survives Next.js hot-reload; plain module-level Map does not
- Idle timeout: 10 minutes. Concurrent `startRpcSession()` calls share a single start Promise (`globalThis.__piStartLocks`)
- Pi SDK startup / event / compatibility details are routed through `lib/adapters/pi/*`; `rpc-manager` remains the registry + API coordinator.

### Fork must destroy the wrapper immediately
`AgentSession.fork()` **mutates the wrapper's inner state in-place** — after fork, `inner.sessionId` is the *new* session's id. If the wrapper stays alive in the registry under the old id, the next request gets the already-forked state and subsequent forks produce a corrupt `parentSession` chain.

**Fix**: `send("fork")` captures `newSessionId`, then calls `this.destroy()` before returning. The next request for the original session reloads a clean AgentSession from the original file.

### Two kinds of branching — don't confuse them
- **Fork** (Fork button on user message): creates a new independent `.jsonl` file. Shown as a child in the sidebar tree via `parentSession` header field.
- **In-session branch** (Continue button / BranchNavigator): calls `navigate_tree` within the same file. Multiple entries share the same `parentId`. Switching between them calls `/api/sessions/[id]/context?leafId=`.

### Session files can be fully rewritten
`parentSession` in the header is **display metadata only** — has zero effect on chat content. Safe to `writeFileSync` the entire file (pi does this itself during migrations). Used when cascade-reparenting children on delete.

### ToolCall field normalization
Pi stores toolCall blocks as `{type:"toolCall", id, name, arguments}` but `ToolCallContent` uses `{toolCallId, toolName, input}`. `PiMessageAdapter` handles this and `lib/normalize.ts` re-exports the same normalization for existing call sites.

### New session tool preset
Tool names are passed at session creation (`POST /api/agent/new` → `toolNames[]`). For existing sessions, the active preset is inferred on mount via `get_tools` → `getPresetFromTools()`. When tools are fully disabled (`toolNames = []`), `rpc-manager.ts` passes an empty tool allow-list and forces `agent.state.systemPrompt = ""` after startup/reload/resource discovery.

### Model defaults for new sessions
`GET /api/models` returns `defaultModel` read from `~/.pi/agent/settings.json`. `ChatWindow` pre-selects this on mount for new sessions.

### SSE reconnect on page refresh mid-stream
On `ChatWindow` mount, `GET /api/agent/[id]` is called. If `state.isStreaming === true`, SSE is reconnected automatically. `thinkingLevel` and `isCompacting` are also synced from this response.

### Compaction SSE events
Newer pi emits `compaction_start` / `compaction_end`; older versions emitted `auto_compaction_start` / `auto_compaction_end`. `PiEventAdapter` normalizes both variants into `compaction_start` / `compaction_end` before they reach React hooks. Manual compact is a blocking POST — the button stays disabled until the response returns.

### Running state SSE + reconciliation
- The sidebar listens to `/api/agent/running/events`, backed by `subscribeRunningSessions()` in `lib/rpc-manager.ts`, so running badges update without polling.
- `useAgentSession` still treats per-session SSE as primary for chat events, but while a run is active it periodically calls `GET /api/agent/[id]` and also reconciles on `visibilitychange`/`online`. This fixes missed `agent_end` events from background tabs or half-open connections.
- Prompt runs use a monotonic run id; late SSE or slow reconciliation responses from an old run must be ignored so they cannot resurrect stale streaming bubbles.

### Worktrees and project grouping
- `lib/worktree.ts` resolves linked worktree top-levels back to the main repo `projectRoot`; `listAllSessions()` attaches that to each `SessionInfo` so all worktrees for one repo are grouped together in the sidebar.
- Worktree operations are served by `/api/worktrees` and guarded by the same allowed-root rules as `/api/files`.
- New worktrees are created under `<repoRoot>-worktrees/<sanitized-branch>`. Existing branches are reused; otherwise `git worktree add -b` creates the branch.
- Removing a dirty worktree returns `409` with `{ dirty: true }` so the UI can ask before retrying with `force`.
- Sessions whose cwd points at a removed worktree are inferred back into the main project instead of becoming a phantom project row.

### File access allow-list
- `/api/files` is intentionally not a general filesystem browser. Allowed roots come from session cwds, their resolved project roots, `~/pi-cwd-*`, and roots explicitly added with `allowFileRoot()`.
- `/api/cwd/validate`, `/api/default-cwd`, and `/api/worktrees` call `allowFileRoot()` when they make a new location browsable.

### Plugins and skills
- `/api/plugins` uses pi's `SettingsManager` + `DefaultPackageManager` for global/project package install, remove, update, enable, and disable. Disabling writes empty `extensions/skills/prompts/themes` arrays for that package entry.
- `/api/skills` uses `DefaultResourceLoader` so settings paths, package skills, and project `.agents/skills` are listed the same way the runtime sees them.
- Skill toggling edits only the `disable-model-invocation` frontmatter key on the target `SKILL.md`; keep that surgical so user formatting survives.
- `/api/skills/install` shells through `npx skills add ... --agent pi`; project installs run with the selected cwd.

### Built-in MCP (bundled pi-mcp-adapter)
- `pi-mcp-adapter` is a regular npm dependency but is **not** imported from Next.js code (its `.ts` extension source + `@napi-rs/keyring` native dep would break webpack). Instead `lib/mcp-extension.ts` resolves the package *directory* at runtime and `startRpcSession()` passes it via `resourceLoaderOptions.additionalExtensionPaths` — the exact same SDK loading path as `pi install npm:pi-mcp-adapter`. Every session automatically gets the ~200-token `mcp` proxy tool.
- Dedup: if the user already has the adapter installed as a pi package (SettingsManager global/project packages), injection is skipped so the extension never loads twice.
- Status: the adapter publishes `MCP_STATUS_EVENT` (`pi-mcp-adapter/status/v1`) snapshots on the resource-loader event bus. `rpc-manager` subscribes, caches the latest snapshot on the wrapper (also emitted as an `mcp_status` SSE event and included in `get_state`), and `/api/mcp/status?sessionId=` serves it to the UI. The first snapshot right after init can be empty; server entries appear once metadata bootstrap finishes.
- Config: `lib/mcp-config.ts` mirrors the adapter's 6-layer file precedence (`~/.config/mcp/mcp.json` → `~/.agents/mcp.json` → `~/.agents/mcp/mcp.json` → `<agentDir>/mcp.json` → `<cwd>/.mcp.json` → `<cwd>/.pi/mcp.json`). Enable/disable only writes the `disabled` key in `.pi/mcp.json` (same as `/mcp disable|enable`). Add/edit/remove only touch the two pi-web-managed targets: project `.mcp.json` and global `~/.config/mcp/mcp.json`; servers defined elsewhere are toggle-only in the UI. Files that would end up as `{"mcpServers": {}}` are deleted instead.
- Secrets (env/header values, bearerToken, oauth.clientSecret) are masked as `***` in GET responses; on save, unchanged `***` values are restored from the previous entry server-side.
- Web OAuth login is out of scope: the UI shows `needs-auth` and points at CLI `/mcp-auth`.

### Auth and model config
- `ModelsConfig` combines models from `~/.pi/agent/models.json` with provider auth status from pi's `AuthStorage`/`ModelRegistry`.
- OAuth/device-code/manual-code flows are streamed by `GET /api/auth/login/[provider]`; manual code responses POST back with a short-lived token stored in `globalThis.__piLoginCallbacks`.
- API-key routes store and remove keys through `AuthStorage`. Status endpoints must never return the raw key.
- The model test route is `app/api/models-config/test/route.ts`; `app/api/models/test/` is not a real route.

### Completion sound
- `hooks/useAudio.ts` stores the toggle in `localStorage` as `pi-sound-enabled` and reuses one `AudioContext`.
- Browser autoplay policy means sound must be unlocked from a user gesture; `ChatInput` calls the unlock hook from interactive controls, and `ChatWindow` plays the tone from `onAgentEnd`.

### Exported session HTML
- `/api/sessions/[id]/export` delegates to pi's export helper, then patches recursive tree helpers in the generated HTML to iterative versions so very deep linear sessions do not overflow the browser call stack.

## Pi Session File Format

Location: `~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`

```jsonl
{"type":"session","version":3,"id":"<uuid>","timestamp":"...","cwd":"/path","parentSession":"/abs/path/to/parent.jsonl"}
{"type":"model_change","id":"<8hex>","parentId":null,"provider":"zenmux","modelId":"claude-sonnet-4-6","timestamp":"..."}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"user","content":"..."}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"assistant","content":[...],...}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"toolResult","toolCallId":"...","content":[...]}}
{"type":"compaction","id":"<8hex>","parentId":"<8hex>","summary":"...","firstKeptEntryId":"<8hex>","tokensBefore":N}
{"type":"session_info","id":"...","parentId":"...","name":"user-defined name"}
```

`entryIds[]` in `SessionContext` is a parallel array to `messages[]` — maps each displayed message back to its `.jsonl` entry id, used for fork and navigate_tree calls.

---

## CSS Variables (`app/globals.css`)

```
--bg --bg-panel --bg-hover --bg-selected --border
--text --text-muted --text-dim
--accent --user-bg --tool-bg
--font-mono
```
