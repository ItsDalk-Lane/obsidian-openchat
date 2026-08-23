# agegr/pi-web — Recent Releases

Source: [`GET /repos/agegr/pi-web/releases`](https://api.github.com/repos/agegr/pi-web/releases)
Fetched: from upstream GitHub via Node.js `https.get` (the local `curl.exe`/PowerShell TLS stack returned `SEC_E_NO_CREDENTIALS` on GitHub's TLS endpoint — fetch worked through Node.js instead).
Total releases returned: **27** (newest first).

The npm package name is `@agegr/pi-web` (per `package.json`).

> All release bodies are also saved verbatim to `.research/releases.json` (89 KB). Other release notes not shown here are short or empty in the GitHub response — refer to that file for the exact strings.

## All releases (tag · published · name)

| # | tag | published_at | name |
|---|-----|--------------|------|
| 0 | v0.8.9 | 2026-08-15T15:31:30Z | v0.8.9 |
| 1 | v0.8.8 | 2026-08-12T14:40:49Z | v0.8.8 |
| 2 | v0.8.7 | 2026-08-06T15:05:26Z | v0.8.7 |
| 3 | v0.8.6 | 2026-07-31T17:03:30Z | v0.8.6 |
| 4 | v0.8.5 | 2026-07-30T16:49:07Z | v0.8.5 |
| 5 | v0.8.4 | 2026-07-30T03:35:45Z | v0.8.4 |
| 6 | v0.8.3 | 2026-07-29T17:00:30Z | v0.8.3 |
| 7 | v0.8.2 | 2026-07-27T16:12:38Z | v0.8.2 |
| 8 | v0.8.1 | 2026-07-25T17:32:04Z | v0.8.1 |
| 9 | v0.8.0 | 2026-07-22T13:28:11Z | v0.8.0 |
| 10 | v0.7.17 | 2026-07-21T09:54:33Z | v0.7.17 |
| 11 | v0.7.16 | 2026-07-17T01:09:15Z | v0.7.16 |
| 12 | v0.7.15 | 2026-07-16T12:52:02Z | v0.7.15 |
| 13 | v0.7.14 | 2026-07-16T01:30:23Z | v0.7.14 |
| 14 | v0.7.13 | 2026-07-15T15:07:24Z | v0.7.13 |
| 15 | v0.7.12 | 2026-07-15T01:04:37Z | v0.7.12 |
| 16 | v0.7.11 | 2026-07-11T11:52:12Z | v0.7.11 |
| 17 | v0.7.10 | 2026-07-10T01:12:52Z | v0.7.10 |
| 18 | v0.7.9 | 2026-07-06T15:08:23Z | v0.7.9 |
| 19 | v0.7.8 | 2026-07-04T13:03:27Z | v0.7.8 |
| 20 | v0.7.7 | 2026-07-03T15:06:08Z | v0.7.7 |
| 21 | v0.7.6 | 2026-07-03T15:02:25Z | v0.7.6 |
| 22 | v0.7.5 | 2026-07-03T09:32:39Z | v0.7.5 |
| 23 | v0.7.4 | 2026-07-02T11:44:06Z | v0.7.4 |
| 24 | v0.7.2 | 2026-07-01T15:07:45Z | v0.7.2 |
| 25 | v0.7.1 | 2026-07-01T01:04:20Z | v0.7.1 |
| 26 | v0.7.0 | 2026-06-26T16:47:34Z | v0.7.0 |

## Latest release

- **tag_name:** `v0.8.9`
- **name:** `v0.8.9`
- **published_at:** `2026-08-15T15:31:30Z`
- **html_url:** https://github.com/agegr/pi-web/releases/tag/v0.8.9
- **Release notes (body):** see `v0.89-notes.md` (full Chinese + English text).

The latest release **is** the "0.89" the prompt asks about — upstream versions all use the `0.8.x` semver track, so `0.89` ↔ `v0.8.9`. There is no `v0.89.0` or `0.89` tag.

## Prior release (for the diff)

- **tag_name:** `v0.8.8`
- **published_at:** `2026-08-12T14:40:49Z`

## package.json (current `main`)

`https://raw.githubusercontent.com/agegr/pi-web/main/package.json` returned (full file saved as `.research/package.json`):

- **name:** `@agegr/pi-web`
- **version:** `0.8.9`
- **description:** `Web UI for the pi coding agent`
- **license:** `MIT`
- **repository:** `git+https://github.com/agegr/pi-web.git`
- **homepage:** `https://github.com/agegr/pi-web#readme`
- **engines:** `{ "node": ">=22.19.0" }`

### Dependencies

| dep | version |
|-----|---------|
| `@earendil-works/pi-agent-core` | `0.84.2` |
| `@earendil-works/pi-ai` | `0.84.2` |
| `@earendil-works/pi-coding-agent` | `0.84.2` |
| `@earendil-works/pi-tui` | `0.84.2` |
| `js-yaml` | `^5.2.3` |
| `next` | `16.3.1` |
| `proper-lockfile` | `4.1.2` |
| `react` | `^19.2.4` |
| `react-dom` | `^19.2.4` |
| `remark-frontmatter` | `^5.0.0` |
| `undici` | `8.10.0` |

### DevDependencies (selected)

`@lobehub/icons ^5.6.0`, `@tailwindcss/postcss ^4.2.2`, `@types/*`, `eslint ^9`, `eslint-config-next 16.3.1`, `jiti ^2.7.0`, `katex ^0.16.47`, `mammoth ^1.12.0`, `mermaid ^11.16.1`, `postcss ^8.5.26`, `react-markdown ^10.1.0`, `react-syntax-highlighter ^16.1.1`, `rehype-katex ^7.0.1`, `rehype-raw ^7.0.0`, `rehype-sanitize ^6.0.0`, `remark-gfm ^4.0.1`, `remark-math ^6.0.0`, `tailwindcss ^4.2.2`, `typescript ^5`.

## Selected release notes (most recent 0.8.x)

> The earlier `releases.md` saved a long-form dump of release notes. The GitHub API returns the Chinese + English bodies for all 0.8.x releases. The full per-release bodies are in `.research/releases.json` for any release you want to inspect.

### v0.8.8 highlights (only this one quoted inline — rest are in the JSON file)

> Prepared from commits in `v0.7.17..v0.8.0` and `v0.8.0..v0.8.8` history. The most recent highlights before v0.8.9:
>
> - **More reliable live sessions**: upgraded to Pi `v0.84.1` and its new streaming delta protocol, with stronger SSE reconnects, cross-tab recovery, and rejected-submission recovery to prevent dropped streams, duplicate messages, and stuck states.
> - **Clearer task activity across workspaces**: workspace selector shows running and unread activity, restores last session, and adds sounds and browser notifications for background completion / attention requests.
> - **Faster access to generated files**: files written during a turn appear below the reply, HTML opens in preview by default, file tabs preserve viewer state, chat images open in a larger preview, Markdown frontmatter renders as a metadata card.
> - **Reworked mobile experience**: compact toolbar, Enter = newline, Ctrl/Cmd+Enter = send, iOS PWA viewport + keyboard + rotation fixes.
> - **Custom models**: provider/model request headers, developer-role compatibility, pricing + thinking controls, model-switch feedback, load errors, and a new read-only tool preset.
> - **Branches labeled by diverging messages**; session stats add active time and average cache hit rate; System panel can load the system prompt before the first message.
> - **Long/streaming message perf**, scroll-following, CJK token/TPS estimates, single-tilde text; fixed Windows directory browsing, worktree path identity, and packaging compatibility.

For v0.8.9 release notes, see [`v0.89-notes.md`](./v0.89-notes.md).
For the diff between v0.8.8 → v0.8.9, see [`compare.md`](./compare.md).