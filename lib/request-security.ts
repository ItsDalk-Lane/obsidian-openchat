function canonicalOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function getRequestOrigin(request: Request): string | null {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  return host ? canonicalOrigin(`${requestUrl.protocol}//${host}`) : requestUrl.origin;
}

/** Reject browser cross-site API requests while preserving non-browser clients. */
export function isApiRequestOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;
  if (!origin) return true;

  const requestOrigin = getRequestOrigin(request);
  return requestOrigin !== null && canonicalOrigin(origin) === requestOrigin;
}

export function shouldCheckApiRequestOrigin(request: Request): boolean {
  return request.headers.has("origin") || request.headers.has("sec-fetch-site");
}

export function shouldRequireLanApiToken(request: Request): boolean {
  const token = process.env.PI_WEB_LAN_API_TOKEN?.trim();
  if (!token) return false;
  const requestUrl = new URL(request.url);
  return !isLoopbackHostname(requestUrl.hostname);
}

export function isLanApiTokenAllowed(request: Request): boolean {
  const token = process.env.PI_WEB_LAN_API_TOKEN?.trim();
  if (!token) return true;
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ") && authHeader.slice("Bearer ".length).trim() === token) {
    return true;
  }
  const headerToken = request.headers.get("x-pi-web-token")?.trim();
  return headerToken === token;
}
