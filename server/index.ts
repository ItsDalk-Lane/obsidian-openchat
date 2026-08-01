import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "@/server/app";

const DEFAULT_PORT = 30141;
const DEFAULT_HOSTNAME = "127.0.0.1";

function readPort(): number {
  const raw = process.env.PI_WEB_PORT ?? process.env.PORT;
  if (!raw) return DEFAULT_PORT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`Invalid server port: ${raw}`);
  }
  return parsed;
}

export async function startServer() {
  const hostname = process.env.PI_WEB_HOSTNAME?.trim() || DEFAULT_HOSTNAME;
  const port = readPort();
  process.env.PI_WEB_HOSTNAME = hostname;

  const app = await createApp();
  const server = serve({ fetch: app.fetch, hostname, port }, () => {
    console.log(`Ready - Pi Web server listening on http://${hostname}:${port}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return server;
}

const entrypoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";

if (import.meta.url === entrypoint) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
