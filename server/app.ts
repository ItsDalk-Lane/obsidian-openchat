import { Hono } from "hono";
import {
  isApiRequestAllowed,
  isLanApiTokenAllowed,
  shouldRequireLanApiToken,
} from "@/lib/request-security";
import { attachNextUrl } from "@/server/next-compat";
import { registerApiRoutes } from "@/server/api-router";

export async function createApp(): Promise<Hono> {
  const app = new Hono();

  app.use("/api/*", async (context, next) => {
    const request = attachNextUrl(context.req.raw);
    if (!isApiRequestAllowed(request)) {
      return context.json({ error: "Untrusted API request" }, 403);
    }
    if (shouldRequireLanApiToken(request) && !isLanApiTokenAllowed(request)) {
      return context.json({ error: "Missing or invalid LAN API token" }, 401);
    }
    await next();
  });

  await registerApiRoutes(app);

  app.notFound((context) => {
    if (context.req.path.startsWith("/api/")) {
      return context.json({ error: "Not found" }, 404);
    }
    return context.text("Pi Web frontend has not been built", 404);
  });

  return app;
}
