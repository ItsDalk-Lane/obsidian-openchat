import { readdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Hono } from "hono";
import { attachRequestUrl } from "@/server/http";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
type RouteParams = Record<string, string | string[]>;
type RouteHandler = (
  request: Request,
  context: { params: Promise<RouteParams> },
) => Response | Promise<Response>;

type ParamBinding = {
  catchAll: boolean;
  name: string;
};

type RouteDefinition = {
  filePath: string;
  honoPath: string;
  matcher: RegExp;
  paramBindings: ParamBinding[];
  score: number;
};

const DEFAULT_API_ROOT = fileURLToPath(new URL("./api", import.meta.url));

async function findRouteFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findRouteFiles(entryPath));
    } else if (entry.isFile() && entry.name === "route.ts") {
      files.push(entryPath);
    }
  }

  return files;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildDefinition(filePath: string, apiRoot: string): RouteDefinition {
  const routeDirectory = relative(apiRoot, dirname(filePath));
  const segments = routeDirectory === "" ? [] : routeDirectory.split(sep);
  const honoSegments = ["api"];
  const matcherSegments = ["api"];
  const paramBindings: ParamBinding[] = [];
  let score = 0;

  for (const segment of segments) {
    const catchAll = /^\[\.\.\.(.+)]$/.exec(segment);
    if (catchAll) {
      honoSegments.push("*");
      matcherSegments.push("(.+)");
      paramBindings.push({ catchAll: true, name: catchAll[1] });
      continue;
    }

    const dynamic = /^\[(.+)]$/.exec(segment);
    if (dynamic) {
      honoSegments.push(`:${dynamic[1]}`);
      matcherSegments.push("([^/]+)");
      paramBindings.push({ catchAll: false, name: dynamic[1] });
      score += 10;
      continue;
    }

    honoSegments.push(segment);
    matcherSegments.push(escapeRegExp(segment));
    score += 100;
  }

  score += segments.length;
  return {
    filePath,
    honoPath: `/${honoSegments.join("/")}`,
    matcher: new RegExp(`^/${matcherSegments.join("/")}/?$`),
    paramBindings,
    score,
  };
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractParams(definition: RouteDefinition, request: Request): RouteParams {
  const pathname = new URL(request.url).pathname;
  const match = definition.matcher.exec(pathname);
  if (!match) return {};

  const params: RouteParams = {};
  definition.paramBindings.forEach((binding, index) => {
    const captured = match[index + 1] ?? "";
    params[binding.name] = binding.catchAll
      ? captured.split("/").map(decodeSegment)
      : decodeSegment(captured);
  });
  return params;
}

export async function registerApiRoutes(
  app: Hono,
  apiRoot = DEFAULT_API_ROOT,
): Promise<number> {
  const definitions = (await findRouteFiles(apiRoot))
    .map((filePath) => buildDefinition(filePath, apiRoot))
    .sort((left, right) => right.score - left.score || left.honoPath.localeCompare(right.honoPath));

  for (const definition of definitions) {
    const routeModule = await import(pathToFileURL(definition.filePath).href) as Partial<
      Record<HttpMethod, RouteHandler>
    >;

    for (const method of HTTP_METHODS) {
      const handler = routeModule[method];
      if (!handler) continue;

      app.on(method, definition.honoPath, async (context) => {
        const request = attachRequestUrl(context.req.raw);
        return handler(request, {
          params: Promise.resolve(extractParams(definition, request)),
        });
      });
    }
  }

  return definitions.length;
}
