import { resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import {
  isApiRequestAllowed,
  isLanApiTokenAllowed,
  shouldRequireLanApiToken,
} from "@/lib/request-security";
import { isWebPasswordEnabled, isValidBasicAuthorization } from "@/lib/web-auth";
import { attachRequestUrl } from "@/server/http";
import { registerApiRoutes } from "@/server/api-router";

export async function createApp(): Promise<Hono> {
  const app = new Hono();
  const webDist = resolve(process.env.PI_WEB_STATIC_DIR ?? "web/dist");

  // Optional Basic auth (PI_WEB_PASSWORD). Applies to pages and the API alike;
  // the browser retries with credentials after the 401 + WWW-Authenticate.
  app.use("*", async (context, next) => {
    const password = process.env.PI_WEB_PASSWORD;
    if (
      isWebPasswordEnabled(password)
      && !isValidBasicAuthorization(context.req.header("authorization") ?? null, password)
    ) {
      return context.text("Authentication required", 401, {
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Basic realm="Pi Web", charset="UTF-8"',
      });
    }
    await next();
  });

  app.use("/api/*", async (context, next) => {
    const request = attachRequestUrl(context.req.raw);
    if (!isApiRequestAllowed(request)) {
      return context.json({ error: "Untrusted API request" }, 403);
    }
    if (shouldRequireLanApiToken(request) && !isLanApiTokenAllowed(request)) {
      return context.json({ error: "Missing or invalid LAN API token" }, 401);
    }
    await next();
  });

  await registerApiRoutes(app);

  app.all("/api/*", (context) => context.json({ error: "Not found" }, 404));
  app.use("*", serveStatic({
    root: webDist,
    onFound: (_path, context) => {
      if (context.req.path === "/") {
        context.header("Cache-Control", "private, no-cache, max-age=0, must-revalidate");
      }
    },
  }));

  app.notFound((context) => {
    return context.text("Pi Web frontend has not been built", 404);
  });

  return app;
}
