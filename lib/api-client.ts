export interface JsonRequestInit extends Omit<RequestInit, "body"> {
  json?: unknown;
}

export class ApiRequestError<T = unknown> extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data: T,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function getResponseError(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("error" in data)) return null;
  const error = (data as { error?: unknown }).error;
  return typeof error === "string" && error.length > 0 ? error : null;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const message = response.ok
      ? `服务器返回了无效 JSON（HTTP ${response.status}）`
      : `HTTP ${response.status}`;
    throw new ApiRequestError(message, response.status, text);
  }
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init: JsonRequestInit = {},
): Promise<T> {
  const { json, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  let body: string | undefined;

  if (json !== undefined) {
    body = JSON.stringify(json);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  const response = await fetch(input, {
    ...requestInit,
    headers,
    body,
  });
  const data = await parseResponseBody(response);
  const responseError = getResponseError(data);

  if (!response.ok || responseError) {
    throw new ApiRequestError(
      responseError ?? `HTTP ${response.status}`,
      response.status,
      data,
    );
  }

  return data as T;
}
