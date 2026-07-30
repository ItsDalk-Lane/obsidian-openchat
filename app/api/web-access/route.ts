import { NextResponse } from "next/server";
import {
  getWebAccessConfigPath,
  readWebAccessConfig,
  saveWebAccessConfig,
  type WebAccessConfig,
} from "@/lib/web-access-config";
import { getRpcSession } from "@/lib/rpc-manager";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function reloadActiveSession(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  const wrapper = getRpcSession(sessionId);
  if (!wrapper?.isAlive() || wrapper.isRunning()) return;
  try {
    await wrapper.send({ type: "reload" });
  } catch (error) {
    console.warn(
      "[pi-web] session reload after web access config change failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

export async function GET() {
  try {
    return NextResponse.json({
      config: readWebAccessConfig(),
      path: getWebAccessConfigPath(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json() as {
      config?: WebAccessConfig;
      sessionId?: string;
    };
    if (!isRecord(body.config)) {
      return NextResponse.json({ error: "config must be an object" }, { status: 400 });
    }

    const config = saveWebAccessConfig(body.config);
    await reloadActiveSession(body.sessionId);
    return NextResponse.json({
      success: true,
      config,
      path: getWebAccessConfigPath(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
