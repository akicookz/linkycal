export interface CapturedRequest {
  method: string;
  url: URL;
  headers: Headers;
  text: string;
  json: unknown;
}

interface HttpRoute {
  method: string;
  matches(url: URL): boolean;
  respond(request: CapturedRequest): Response | Promise<Response>;
}

export interface HttpCapture {
  requests: CapturedRequest[];
  fetch: typeof globalThis.fetch;
  requestsFor(method: string, pathname: string): CapturedRequest[];
  restore(): void;
}

function resolveRequestUrl(input: RequestInfo | URL): URL {
  if (typeof input === "string") {
    return new URL(input, "http://localhost");
  }
  if (input instanceof URL) {
    return new URL(input.toString());
  }
  return new URL(input.url, "http://localhost");
}

async function readRequestText(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<string> {
  if (typeof init?.body === "string") return init.body;
  if (init?.body instanceof URLSearchParams) return init.body.toString();
  if (typeof input !== "string" && !(input instanceof URL)) {
    return input.clone().text();
  }
  return "";
}

function readRequestHeaders(
  input: RequestInfo | URL,
  init?: RequestInit,
): Headers {
  if (init?.headers) return new Headers(init.headers);
  if (typeof input !== "string" && !(input instanceof URL)) {
    return new Headers(input.headers);
  }
  return new Headers();
}

export function installHttpCapture(routes: HttpRoute[]): HttpCapture {
  const originalFetch = globalThis.fetch;
  const requests: CapturedRequest[] = [];

  async function capturedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = resolveRequestUrl(input);
    const inputMethod =
      typeof input !== "string" && !(input instanceof URL)
        ? input.method
        : "GET";
    const method = (init?.method ?? inputMethod).toUpperCase();
    const text = await readRequestText(input, init);
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    const request: CapturedRequest = {
      method,
      url,
      headers: readRequestHeaders(input, init),
      text,
      json,
    };
    requests.push(request);

    const route = routes.find(function routeMatches(candidate) {
      return candidate.method.toUpperCase() === method && candidate.matches(url);
    });
    if (!route) {
      throw new Error(`Unexpected HTTP request: ${method} ${url.toString()}`);
    }
    return route.respond(request);
  }

  globalThis.fetch = capturedFetch;

  return {
    requests,
    fetch: capturedFetch,
    requestsFor: function requestsFor(method, pathname) {
      return requests.filter(function matches(request) {
        return request.method === method.toUpperCase() &&
          request.url.pathname === pathname;
      });
    },
    restore: function restore() {
      globalThis.fetch = originalFetch;
    },
  };
}
