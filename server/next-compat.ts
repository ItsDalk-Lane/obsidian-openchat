/**
 * 迁移期仅保留路由真正用到的 Next.js 请求/响应表面。
 * 业务路由仍然收发标准 Web Request/Response，不引入新的协议层。
 */
export type NextRequest = Request & {
  readonly nextUrl: URL;
};

export class NextResponse extends Response {
  static json<JsonBody>(body: JsonBody, init?: ResponseInit): NextResponse {
    const json = JSON.stringify(body);
    if (json === undefined) {
      throw new TypeError("Value is not JSON serializable");
    }

    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    return new NextResponse(json, { ...init, headers });
  }
}

export function attachNextUrl(request: Request): NextRequest {
  const compatible = request as NextRequest;
  if (!("nextUrl" in compatible)) {
    Object.defineProperty(compatible, "nextUrl", {
      configurable: false,
      enumerable: false,
      value: new URL(request.url),
      writable: false,
    });
  }
  return compatible;
}
