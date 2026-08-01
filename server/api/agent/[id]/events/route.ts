import { getSessionCwd, resolveSessionPath } from "@/lib/session-reader";
import { getRpcSession, startRpcSession } from "@/lib/rpc-manager";
import { createKernelEvent } from "@/lib/kernel";
import { getKernelServices } from "@/lib/server/kernel-services";
import {
  encodeKernelEventSse,
  replayDurableRuntimeEvents,
  resolveEventCursor,
} from "@/lib/server/runtime-event-stream";

export const dynamic = "force-dynamic";

// GET /api/agent/[id]/events - SSE stream of agent events
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cursorResult = resolveEventCursor(req);
  if (!cursorResult.ok) {
    return new Response(cursorResult.error, { status: 400 });
  }

  // Fast path: already-running session
  let session = getRpcSession(id);
  let runtimeContext = session?.getRuntimeContext();
  if (!session || !session.isAlive()) {
    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return new Response("Session not found", { status: 404 });
    }
    const cwd = getSessionCwd(filePath) ?? process.cwd();
    try {
      ({ session, runtimeContext } = await startRpcSession(id, filePath, cwd));
    } catch (error) {
      return new Response(`Failed to start agent: ${error}`, { status: 500 });
    }
  }
  const context = runtimeContext ?? session.getRuntimeContext();
  const journal = getKernelServices().uow.events;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const encode = (event: Parameters<typeof encodeKernelEventSse>[0], sequence?: number) => {
        controller.enqueue(encoder.encode(encodeKernelEventSse(event, sequence)));
      };
      let replaying = true;
      let deliveredCursor = -1;
      const buffered: Array<{ event: Parameters<typeof encode>[0]; sequence?: number }> = [];
      const deliverLive = (event: Parameters<typeof encode>[0], sequence?: number) => {
        if (sequence !== undefined) {
          if (sequence <= deliveredCursor) return;
          deliveredCursor = sequence;
        }
        encode(event, sequence);
      };
      const unsubscribe = session.onEvent((event, sequence) => {
        if (replaying) {
          buffered.push({ event, sequence });
          return;
        }
        deliverLive(event, sequence);
      });

      const latestSequence = journal.getLatestSequence();
      const replayFrom = cursorResult.cursor !== undefined && cursorResult.cursor <= latestSequence
        ? cursorResult.cursor
        : undefined;
      const initialCursor = replayFrom ?? latestSequence;
      deliveredCursor = initialCursor;
      encode(createKernelEvent(
        "transport.connected",
        context.taskId,
        context.runId,
        { sessionId: id },
        { kind: "transport", adapter: "pi", nativeType: "connected" },
      ), initialCursor);

      if (replayFrom !== undefined) {
        replayDurableRuntimeEvents(
          journal,
          context,
          replayFrom,
          (entry) => {
            encode(entry.event, entry.sequence);
            deliveredCursor = entry.sequence;
          },
        );
      }
      replaying = false;
      for (const delivery of buffered) {
        deliverLive(delivery.event, delivery.sequence);
      }

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(":\n\n"));
        } catch {
          // 连接已经关闭
        }
      }, 30_000);

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      };

      req.signal?.addEventListener("abort", cleanup, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
