# Isolate project command environments from the web host

Pi Web sanitizes the environment of its built-in project shells instead of
exposing the web host runtime wholesale. The agent `bash` tool and direct user
shell commands remove `PORT`, `NODE_ENV`, and `NEXT_*` variables while
preserving the SDK-managed PATH, Pi session metadata, and all other inherited
values; explicit variables set by a project command still take effect.
Third-party extensions retain control of their own tools and subprocesses so
existing overrides and remote execution integrations are not intercepted.

> Note: this fork is no longer a Next.js application. The fork's runtime server
> is Hono-based, so `NEXT_*` does not appear naturally in the host process.
> The sanitizer still drops `PORT` / `NODE_ENV` (these can leak from dev shells
> and CI runners) and any environment variable a future host happens to set
> whose name starts with `NEXT_`, so the contract stays future-proof.
