import type { RuntimeCommand, RuntimeCommandResult } from "./kernel";
import { requestJson } from "./api-client";

// Client-side helper for POST /api/agent/[id].
//
// Every /api/agent/[id] route returns one of:
//   { success: true, data: <result> }
//   { error: string }              (non-2xx)
//
// Call sites previously repeated the same 5-line fetch block 13× in
// hooks/useAgentSession.ts. This helper collapses that down to one line.

export async function sendAgentCommand<C extends RuntimeCommand>(
  sessionId: string,
  command: C,
): Promise<RuntimeCommandResult<C>> {
  const body = await requestJson<{
    success?: boolean;
    data?: RuntimeCommandResult<C>;
  }>(`/api/agent/${encodeURIComponent(sessionId)}`, {
    method: "POST",
    json: command,
  });
  return body.data as RuntimeCommandResult<C>;
}
