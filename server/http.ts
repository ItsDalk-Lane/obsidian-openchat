/**
 * 给路由补上统一的 URL 解析结果，并提供 JSON 响应助手。
 * 业务路由仍然只收发标准 Web Request/Response，不引入新的协议层。
 */
export type ApiRequest = Request & {
  readonly requestUrl: URL;
};

export class ApiResponse extends Response {
  static json<JsonBody>(body: JsonBody, init?: ResponseInit): ApiResponse {
    const json = JSON.stringify(body);
    if (json === undefined) {
      throw new TypeError("Value is not JSON serializable");
    }

    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    return new ApiResponse(json, { ...init, headers });
  }
}

export function attachRequestUrl(request: Request): ApiRequest {
  const compatible = request as ApiRequest;
  if (!("requestUrl" in compatible)) {
    Object.defineProperty(compatible, "requestUrl", {
      configurable: false,
      enumerable: false,
      value: new URL(request.url),
      writable: false,
    });
  }
  return compatible;
}
