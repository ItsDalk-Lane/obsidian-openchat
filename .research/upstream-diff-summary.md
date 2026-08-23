# Upstream `agegr/pi-web` — Diff Summary: v0.8.8 → v0.8.9

> Source: `https://api.github.com/repos/agegr/pi-web/compare/v0.8.8...v0.8.9` (saved as `_upstream-compare.json`, 189,697 bytes).

## Headline numbers

| metric | value |
|--------|-------|
| status | `ahead` |
| ahead_by | **13** commits |
| behind_by | 0 |
| files changed | **49** (16 added, 33 modified, 0 renamed, 0 removed) |
| total additions | **+2,281** |
| total deletions | **-805** |

## Commits (oldest → newest)

| # | sha | date (UTC) | message |
|---|-----|------------|---------|
| 0 | `77e482d` | 2026-08-14T06:29:10Z | fix(streaming): show tool calls while arguments stream |
| 1 | `fb8e295` | 2026-08-15T13:50:47Z | fix: center chat notices consistently (#491) |
| 2 | `5d07375` | 2026-08-15T13:56:48Z | fix: isolate project command environments (#487) |
| 3 | `fa32336` | 2026-08-15T14:02:28Z | fix: normalize Windows project identity (#490) |
| 4 | `7152653` | 2026-08-15T14:19:03Z | fix: forward wrapper shutdown signals to Next child (#502) |
| 5 | `586d72e` | 2026-08-15T14:34:54Z | fix: guard model provider responses |
| 6 | `7473ac6` | 2026-08-15T14:42:54Z | fix: keep markdown table source tokens inline (#460) |
| 7 | `9e46430` | 2026-08-15T15:08:48Z | Merge branch 'main' of https://github.com/agegr/pi-web |
| 8 | `b9bb1d9` | 2026-08-15T15:09:09Z | fix(streaming): show tool execution progress |
| 9 | `06522eb` | 2026-08-15T15:09:31Z | fix: reject ambiguous bare model scopes |
| 10 | `af0b592` | 2026-08-15T15:25:09Z | fix: update vulnerable dependencies |
| 11 | `febcba5` | 2026-08-15T15:28:12Z | chore: upgrade pi dependencies to 0.84.2 |
| 12 | `2a6e537` | 2026-08-15T15:30:31Z | Release v0.8.9 |

## Categorized changes (features / fixes / refactors / infra)

> Most of v0.8.9 is **fixes and hardening** — every code change is prefixed `fix:` or `chore:` in the commit log. There are no `feat:` commits and no large refactors. The "Infrastructure" bucket is the Pi SDK upgrade and security-dependency bumps. The release commit and the merge commit are bookkeeping.

### Features

_None._

### Fixes

- `77e482d` — fix(streaming): show tool calls while arguments stream — render tool calls during argument streaming; add execution progress feedback. Touches `components/MessageView.tsx`, `components/ChatWindow.tsx`, `lib/agent-event-wire.ts`, `lib/streaming-message.ts`, `lib/tool-execution-progress.ts` (new), and tests.
- `b9bb1d9` — fix(streaming): show tool execution progress — extends the same flow with extra progress events during tool execution.
- `06522eb` — fix: reject ambiguous bare model scopes — `lib/model-scope.ts` now rejects ambiguous bare model-scope patterns that could otherwise match the wrong model.
- `7473ac6` — fix: keep markdown table source tokens inline (#460) — `lib/normalize.ts` no longer mangles Markdown table source tokens during normalization.
- `586d72e` — fix: guard model provider responses — `components/ModelsConfig.tsx` validates provider responses so malformed payloads cannot break the Models config UI.
- `7152653` — fix: forward wrapper shutdown signals to Next child (#502) — new `bin/process-lifecycle.js` + `lib/process-lifecycle.ts` tests forward signals and bound the wait; `lib/rpc-manager.ts` shutdown now uses it.
- `fa32336` — fix: normalize Windows project identity (#490) — new `lib/project-identity.ts` (and tests) canonicalize Windows project paths so project and worktree detection works correctly.
- `5d07375` — fix: isolate project command environments (#487) — new `lib/project-command-env.ts` strips host-only `PORT`, `NODE_ENV`, and `NEXT_*` env vars from per-project command environments while preserving SDK and extension overrides; documented in `docs/adr/0001-isolate-project-command-environments.md`. `bin/pi-web.js` wires it in.
- `fb8e295` — fix: center chat notices consistently (#491) — chat notices are centered and aligned to the desktop chat column; `components/AppShell.tsx`, `app/globals.css`, and `hooks/useAgentSession.ts` updated.

### Refactors

- `fa32336 / 5d07375` — **Architectural refactor (implicit in the fixes above)**: project/worktree identity is now computed by a dedicated `lib/project-identity.ts` + `lib/project-groups.ts` pair, and per-project command environments are produced by `lib/project-command-env.ts`. `components/SessionSidebar.tsx`, `app/api/cwd/validate/route.ts`, and `app/api/worktrees/route.ts` were reworked to use the new helpers.

### Infra / dependency bumps

- `af0b592` — fix: update vulnerable dependencies — bumps deps with known security issues (see `package-lock.json`).
- `febcba5` — chore: upgrade Pi dependencies to 0.84.2 — `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui` all move from 0.84.1 → 0.84.2.

### Docs

- `fa32336 / 5d07375` — New: `docs/adr/0001-isolate-project-command-environments.md` (3-line stub) — documents the env-isolation decision.
- `(added)` — New: `CONTEXT.md` (17 lines) — a short project-context document added at the repo root.

### Release / merge

- `9e46430` — Merge branch 'main' of https://github.com/agegr/pi-web — bookkeeping.
- `2a6e537` — Release v0.8.9 — bumps `package.json` to `0.8.9` and publishes to npm.

## Linked PRs / issues referenced

- #460 — Markdown table source tokens
- #487 — isolate project command environments
- #490 — Windows project identity normalization
- #491 — center chat notices
- #502 — forward wrapper shutdown to Next.js child

## Notable file-level changes (selected)

### Added (16 files)

- `CONTEXT.md` (+17/-0)
- `app/api/cwd/validate/route.test.mjs` (+33/-0)
- `bin/process-lifecycle.js` (+46/-0)
- `components/ChatWindow.notices.test.mjs` (+15/-0)
- `components/SessionSidebar.project-identity.test.mjs` (+19/-0)
- `docs/adr/0001-isolate-project-command-environments.md` (+3/-0)
- `lib/normalize.test.mjs` (+54/-0)
- `lib/process-lifecycle.test.mjs` (+83/-0)
- `lib/project-command-env.test.mjs` (+298/-0)
- `lib/project-command-env.ts` (+129/-0)
- `lib/project-groups.test.mjs` (+60/-0)
- `lib/project-groups.ts` (+53/-0)
- `lib/project-identity.test.mjs` (+37/-0)
- `lib/project-identity.ts` (+26/-0)
- `lib/tool-execution-progress.test.mjs` (+32/-0)
- `lib/tool-execution-progress.ts` (+29/-0)

### Modified (top 25 by churn)

- `package-lock.json` (+569/-621)
- `components/SessionSidebar.tsx` (+99/-71)
- `lib/agent-event-wire.test.mjs` (+131/-1)
- `lib/streaming-message.test.mjs` (+59/-12)
- `lib/model-scope.ts` (+58/-2)
- `lib/agent-event-wire.ts` (+51/-3)
- `components/ChatWindow.tsx` (+23/-20)
- `components/AppShell.tsx` (+26/-15)
- `lib/normalize.ts` (+36/-5)
- `lib/rpc-manager-shutdown.test.mjs` (+40/-0)
- `lib/streaming-message.ts` (+34/-5)
- `components/MessageView.test.mjs` (+30/-3)
- `lib/rpc-manager.ts` (+24/-3)
- `lib/http-dispatcher.test.mjs` (+9/-14)
- `hooks/useAgentSession.ts` (+21/-1)
- `lib/model-scope.test.mjs` (+22/-0)
- `package.json` (+10/-10)
- `components/FileViewer.state.test.mjs` (+18/-0)
- `components/MessageView.tsx` (+11/-5)
- `hooks/useAgentSession.test.mjs` (+12/-0)
- `components/ModelsConfig.test.mjs` (+11/-0)
- `app/api/cwd/validate/route.ts` (+9/-1)
- `lib/workspace-memory.ts` (+5/-5)
- `components/ModelsConfig.tsx` (+6/-2)
- `lib/pi-types.ts` (+5/-1)

### Removed

_(none)_

## Full file list (49 files)

| status | file | +adds | -dels |
|--------|------|------:|------:|
| added | `CONTEXT.md` | 17 | 0 |
| added | `app/api/cwd/validate/route.test.mjs` | 33 | 0 |
| modified | `app/api/cwd/validate/route.ts` | 9 | 1 |
| modified | `app/api/worktrees/route.ts` | 3 | 1 |
| modified | `app/globals.css` | 5 | 0 |
| modified | `bin/pi-web.js` | 3 | 2 |
| added | `bin/process-lifecycle.js` | 46 | 0 |
| modified | `components/AppShell.tsx` | 26 | 15 |
| added | `components/ChatWindow.notices.test.mjs` | 15 | 0 |
| modified | `components/ChatWindow.tsx` | 23 | 20 |
| modified | `components/FileViewer.state.test.mjs` | 18 | 0 |
| modified | `components/MessageView.test.mjs` | 30 | 3 |
| modified | `components/MessageView.tsx` | 11 | 5 |
| modified | `components/ModelsConfig.test.mjs` | 11 | 0 |
| modified | `components/ModelsConfig.tsx` | 6 | 2 |
| added | `components/SessionSidebar.project-identity.test.mjs` | 19 | 0 |
| modified | `components/SessionSidebar.tsx` | 99 | 71 |
| added | `docs/adr/0001-isolate-project-command-environments.md` | 3 | 0 |
| modified | `hooks/useAgentSession.test.mjs` | 12 | 0 |
| modified | `hooks/useAgentSession.ts` | 21 | 1 |
| modified | `lib/agent-event-wire.test.mjs` | 131 | 1 |
| modified | `lib/agent-event-wire.ts` | 51 | 3 |
| modified | `lib/http-dispatcher.test.mjs` | 9 | 14 |
| modified | `lib/i18n/messages/en.ts` | 1 | 0 |
| modified | `lib/i18n/messages/zh-CN.ts` | 1 | 0 |
| modified | `lib/model-scope.test.mjs` | 22 | 0 |
| modified | `lib/model-scope.ts` | 58 | 2 |
| added | `lib/normalize.test.mjs` | 54 | 0 |
| modified | `lib/normalize.ts` | 36 | 5 |
| modified | `lib/pi-types.ts` | 5 | 1 |
| added | `lib/process-lifecycle.test.mjs` | 83 | 0 |
| added | `lib/project-command-env.test.mjs` | 298 | 0 |
| added | `lib/project-command-env.ts` | 129 | 0 |
| added | `lib/project-groups.test.mjs` | 60 | 0 |
| added | `lib/project-groups.ts` | 53 | 0 |
| added | `lib/project-identity.test.mjs` | 37 | 0 |
| added | `lib/project-identity.ts` | 26 | 0 |
| modified | `lib/rpc-manager-shutdown.test.mjs` | 40 | 0 |
| modified | `lib/rpc-manager.ts` | 24 | 3 |
| modified | `lib/session-reader.ts` | 4 | 1 |
| modified | `lib/streaming-message.test.mjs` | 59 | 12 |
| modified | `lib/streaming-message.ts` | 34 | 5 |
| added | `lib/tool-execution-progress.test.mjs` | 32 | 0 |
| added | `lib/tool-execution-progress.ts` | 29 | 0 |
| modified | `lib/types.ts` | 6 | 0 |
| modified | `lib/workspace-memory.test.mjs` | 5 | 1 |
| modified | `lib/workspace-memory.ts` | 5 | 5 |
| modified | `package-lock.json` | 569 | 621 |
| modified | `package.json` | 10 | 10 |

## Summary

**Before (v0.8.8, 2026-08-12):** Pi Web was on Pi SDK `0.84.1`, with reliable live sessions (streaming-delta protocol), cross-tab recovery, a reworked mobile experience, custom-model pricing, and clearer task activity in workspaces.

**After (v0.8.9, 2026-08-15):** v0.8.9 is a one-day patch release that adds:

1. **Tool-call streaming UX** — tool calls now appear in the chat *while* their arguments are still streaming in, with extra progress events during execution (`77e482d`, `b9bb1d9`).
2. **Hardened runtime identity & process lifecycle** — new `lib/project-identity`, `lib/project-groups`, and `lib/project-command-env` modules refactor how project/worktree identity is computed and how per-project command environments are spawned (stripping host-only `PORT`, `NODE_ENV`, `NEXT_*` while preserving SDK/extension overrides). The wrapper's shutdown signal is now forwarded to the Next.js child with a bounded wait through a new `bin/process-lifecycle.js`.
3. **Robustness fixes** — Markdown table source tokens stay inline, ambiguous bare model scopes are rejected, and model-provider responses are guarded so malformed responses can't break the Models panel.
4. **Windows path normalization** — project/worktree detection works correctly on Windows.
5. **Chat notice alignment** — chat notices are now centered and aligned to the desktop chat column.
6. **Pi SDK bump `0.84.1 → 0.84.2`**, plus security-vulnerability dependency updates.

There are **no breaking changes** and **no new features** beyond tool-call streaming UX. The changes are mostly defensive and should be drop-in compatible.
