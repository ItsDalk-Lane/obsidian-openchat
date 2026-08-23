# agegr/pi-web — Compare v0.8.8 → v0.8.9

Source: [`GET /repos/agegr/pi-web/compare/v0.8.8...v0.8.9`](https://api.github.com/repos/agegr/pi-web/compare/v0.8.8...v0.8.9) (saved to `.research/compare-0.8.8-0.8.9.json`).

## Headline numbers

| metric | value |
|--------|-------|
| `status` | `ahead` |
| `ahead_by` | **13** commits |
| `behind_by` | `0` |
| `total_commits` | `13` |
| files changed | **49** (16 added, 33 modified, 0 removed) |
| total additions | **+2,281** |
| total deletions | **-805** |

The `package-lock.json` dominates the diff (+569 / -621 of the 49 files), so the net logical-source-change footprint is much smaller (≈1,712 / -184 across 48 files).

## Commits (oldest → newest)

```
77e482d  fix(streaming): show tool calls while arguments stream                2026-08-14T06:29:10Z
fb8e295  fix: center chat notices consistently (#491)                         2026-08-15T13:50:47Z
5d07375  fix: isolate project command environments (#487)                     2026-08-15T13:56:48Z
fa32336  fix: normalize Windows project identity (#490)                       2026-08-15T14:02:28Z
7152653  fix: forward wrapper shutdown signals to Next child (#502)           2026-08-15T14:19:03Z
586d72e  fix: guard model provider responses                                  2026-08-15T14:34:54Z
7473ac6  fix: keep markdown table source tokens inline (#460)                 2026-08-15T14:42:54Z
9e46430  Merge branch 'main' of https://github.com/agegr/pi-web               2026-08-15T15:08:48Z
b9bb1d9  fix(streaming): show tool execution progress                         2026-08-15T15:09:09Z
06522eb  fix: reject ambiguous bare model scopes                              2026-08-15T15:09:31Z
af0b592  fix: update vulnerable dependencies                                  2026-08-15T15:25:09Z
febcba5  chore: upgrade pi dependencies to 0.84.2                             2026-08-15T15:28:12Z
2a6e537  Release v0.8.9                                                       2026-08-15T15:30:31Z
```

All non-release commits are dated **2026-08-14 → 2026-08-15**; v0.8.9 is a 24-hour patch release.

## What changed (categorized)

### A. Streaming chat tool-call UX (`77e482d`, `b9bb1d9`)

- **`components/MessageView.tsx`** (+11/-5): render tool calls during argument streaming.
- **`components/ChatWindow.tsx`** (+23/-20): tool execution progress UI.
- **`components/MessageView.test.mjs`** (+30/-3): new tests for streaming tool calls.
- New files:
  - **`lib/tool-execution-progress.ts`** (+29): model/tool-execution progress bus.
  - **`lib/tool-execution-progress.test.mjs`** (+32).
- Test additions: **`components/ChatWindow.notices.test.mjs`** (+15).

### B. Project identity, worktrees, and command-env isolation (`fa32336`, `5d07375`)

These three PRs are the **architectural centerpiece** of v0.8.9 — they refactor how project/worktree identity is computed and how per-project command environments are spawned.

- New helpers (all in `lib/`):
  - **`lib/project-identity.ts`** (+26) + test `lib/project-identity.test.mjs` (+37)
  - **`lib/project-groups.ts`** (+53) + test `lib/project-groups.test.mjs` (+60)
  - **`lib/project-command-env.ts`** (+129) + test `lib/project-command-env.test.mjs` (+298)
- **`components/SessionSidebar.tsx`** (+99/-71): use the new project-identity helpers.
- **`app/api/cwd/validate/route.ts`** (+9/-1) and test `route.test.mjs` (+33): canonicalize and reuse the new identity helpers.
- **`app/api/worktrees/route.ts`** (+3/-1): updated to use project groups.
- **`bin/pi-web.js`** (+3/-2): wire the new project command-env when spawning the Next.js child.
- New: **`bin/process-lifecycle.js`** (+46) — shutdown helper that forwards signals; backed by `lib/process-lifecycle.test.mjs` (+83) and `lib/rpc-manager-shutdown.test.mjs` (+40).
- **`lib/rpc-manager.ts`** (+24/-3) + `lib/http-dispatcher.test.mjs` (+9/-14): shutdown lifecycle now goes through the new helper.
- **`docs/adr/0001-isolate-project-command-environments.md`** (+3) — new ADR describing the env-isolation decision.
- New test: **`components/SessionSidebar.project-identity.test.mjs`** (+19).

### C. Markdown / model-scope / model-provider robustness (`7473ac6`, `06522eb`, `586d72e`)

- **`lib/normalize.ts`** (+36/-5) + test `lib/normalize.test.mjs` (+54) — keep Markdown table source tokens inline.
- **`lib/model-scope.ts`** (+58/-2) + test `lib/model-scope.test.mjs` (+22) — reject ambiguous bare model scopes.
- **`components/ModelsConfig.tsx`** (+6/-2) + test `components/ModelsConfig.test.mjs` (+11) — guard model provider responses.
- **`lib/i18n/messages/en.ts`** (+1), **`lib/i18n/messages/zh-CN.ts`** (+1) — i18n strings for the new provider-response guard.

### D. Wrapper → Next.js shutdown forwarding (`7152653`)

- See **Section B** above (`bin/process-lifecycle.js`, `lib/rpc-manager.ts`, `lib/rpc-manager-shutdown.test.mjs`).

### E. Chat notice centering (`fb8e295`)

- **`components/AppShell.tsx`** (+26/-15) + `components/ChatWindow.notices.test.mjs` (+15).
- **`app/globals.css`** (+5) — minor styles for centered notices.
- **`hooks/useAgentSession.ts`** (+21/-1) + `hooks/useAgentSession.test.mjs` (+12) — propagate notice state correctly.

### F. Streaming / event-wire / session-reader internals (cross-cutting, supports A+B+E)

- **`lib/agent-event-wire.ts`** (+51/-3) + test `lib/agent-event-wire.test.mjs` (+131/-1): the streaming event decoder used by `useAgentSession` was extended to surface tool-call arguments and tool execution progress.
- **`lib/streaming-message.ts`** (+34/-5) + test `lib/streaming-message.test.mjs` (+59/-12): streaming-message state machine supports progress events.
- **`lib/session-reader.ts`** (+4/-1): project identity usage.
- **`lib/pi-types.ts`** (+5/-1), **`lib/types.ts`** (+6): types for tool progress.
- **`lib/workspace-memory.ts`** (+5/-5) + test `lib/workspace-memory.test.mjs` (+5/-1): workspace cache invalidated on project identity changes.
- **`components/FileViewer.state.test.mjs`** (+18): tests for state preservation across project switches.

### G. Dependency updates (`af0b592`, `febcba5`)

- **`package.json`**: Pi deps `@earendil-works/pi-{agent-core,ai,coding-agent,tui}` bumped to `0.84.2` (from `0.84.1` in v0.8.8).
- **`package-lock.json`**: regenerated (+569/-621).
- A handful of dependencies with known security issues also updated.

### H. New top-level document: `CONTEXT.md` (+17)

A short project-context document was added at the repo root.

## File-by-file changes

```
[added]    +17/-0   CONTEXT.md
[added]    +33/-0   app/api/cwd/validate/route.test.mjs
[modified]  +9/-1   app/api/cwd/validate/route.ts
[modified]  +3/-1   app/api/worktrees/route.ts
[modified]  +5/-0   app/globals.css
[modified]  +3/-2   bin/pi-web.js
[added]    +46/-0   bin/process-lifecycle.js
[modified] +26/-15  components/AppShell.tsx
[added]    +15/-0   components/ChatWindow.notices.test.mjs
[modified] +23/-20  components/ChatWindow.tsx
[modified] +18/-0   components/FileViewer.state.test.mjs
[modified] +30/-3   components/MessageView.test.mjs
[modified] +11/-5   components/MessageView.tsx
[modified] +11/-0   components/ModelsConfig.test.mjs
[modified]  +6/-2   components/ModelsConfig.tsx
[added]    +19/-0   components/SessionSidebar.project-identity.test.mjs
[modified] +99/-71  components/SessionSidebar.tsx
[added]     +3/-0   docs/adr/0001-isolate-project-command-environments.md
[modified] +12/-0   hooks/useAgentSession.test.mjs
[modified] +21/-1   hooks/useAgentSession.ts
[modified]+131/-1   lib/agent-event-wire.test.mjs
[modified] +51/-3   lib/agent-event-wire.ts
[modified]  +9/-14  lib/http-dispatcher.test.mjs
[modified]  +1/-0   lib/i18n/messages/en.ts
[modified]  +1/-0   lib/i18n/messages/zh-CN.ts
[modified] +22/-0   lib/model-scope.test.mjs
[modified] +58/-2   lib/model-scope.ts
[added]    +54/-0   lib/normalize.test.mjs
[modified] +36/-5   lib/normalize.ts
[modified]  +5/-1   lib/pi-types.ts
[added]    +83/-0   lib/process-lifecycle.test.mjs
[added]   +298/-0   lib/project-command-env.test.mjs
[added]   +129/-0   lib/project-command-env.ts
[added]    +60/-0   lib/project-groups.test.mjs
[added]    +53/-0   lib/project-groups.ts
[added]    +37/-0   lib/project-identity.test.mjs
[added]    +26/-0   lib/project-identity.ts
[modified] +40/-0   lib/rpc-manager-shutdown.test.mjs
[modified] +24/-3   lib/rpc-manager.ts
[modified]  +4/-1   lib/session-reader.ts
[modified] +59/-12  lib/streaming-message.test.mjs
[modified] +34/-5   lib/streaming-message.ts
[added]    +32/-0   lib/tool-execution-progress.test.mjs
[added]    +29/-0   lib/tool-execution-progress.ts
[modified]  +6/-0   lib/types.ts
[modified]  +5/-1   lib/workspace-memory.test.mjs
[modified]  +5/-5   lib/workspace-memory.ts
[modified]+569/-621 package-lock.json
[modified] +10/-10  package.json
```

## Summary of what changed

**Before (v0.8.8, 2026-08-12):** Pi Web was on Pi SDK `0.84.1`, with reliable live sessions (streaming-delta protocol), cross-tab recovery, a reworked mobile experience, custom-model pricing, and clearer task activity in workspaces.

**After (v0.8.9, 2026-08-15):** v0.8.9 is a one-day patch release that adds:

1. **Tool-call streaming UX** — tool calls now appear in the chat *while* their arguments are still streaming, with extra progress events during execution (`77e482d`, `b9bb1d9`).
2. **Hardened runtime identity & process lifecycle** — new `lib/project-identity`, `lib/project-groups`, and `lib/project-command-env` modules refactor how project/worktree identity is computed and how per-project command environments are spawned (stripping host-only `PORT`, `NODE_ENV`, `NEXT_*` while preserving SDK/extension overrides). The wrapper's shutdown signal is now forwarded to the Next.js child with a bounded wait through a new `bin/process-lifecycle.js`.
3. **Robustness fixes** — Markdown table source tokens stay inline, ambiguous bare model scopes are rejected, and model-provider responses are guarded so malformed responses can't break the Models panel.
4. **Windows path normalization** — project/worktree detection works correctly on Windows.
5. **Chat notice alignment** — chat notices are now centered and aligned to the desktop chat column.
6. **Pi SDK bump `0.84.1 → 0.84.2`**, plus security-vulnerability dependency updates.

There are **no breaking changes** and **no new features** beyond tool-call streaming UX. The changes are mostly defensive and should be drop-in compatible.