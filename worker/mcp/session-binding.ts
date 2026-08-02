const SESSION_HANDLE_VERSION = "v1";
const MAX_SESSION_HANDLE_LENGTH = 2_048;
const MAX_INTERNAL_SESSION_ID_LENGTH = 512;

interface ForwardBoundMcpSessionInput {
  request: Request;
  connectionId: string;
  scopes: readonly string[];
  secret: string;
  fetchMcp: (request: Request) => Promise<Response>;
}

interface SessionHandlePayload {
  connectionId: string;
  scopes: string[];
  sessionId: string;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/")
      + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, function toByte(character) {
      return character.charCodeAt(0);
    });
  } catch {
    return null;
  }
}

function normalizedScopes(scopes: readonly string[]): string[] {
  return Array.from(new Set(scopes)).sort();
}

async function importSessionKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function createSessionHandle(
  input: Pick<
    ForwardBoundMcpSessionInput,
    "connectionId" | "scopes" | "secret"
  >,
  sessionId: string,
): Promise<string> {
  const payload = encodeBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        connectionId: input.connectionId,
        scopes: normalizedScopes(input.scopes),
        sessionId,
      } satisfies SessionHandlePayload),
    ),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await importSessionKey(input.secret),
      new TextEncoder().encode(`${SESSION_HANDLE_VERSION}.${payload}`),
    ),
  );
  return `${SESSION_HANDLE_VERSION}.${payload}.${encodeBase64Url(signature)}`;
}

async function readSessionHandle(
  input: Pick<
    ForwardBoundMcpSessionInput,
    "connectionId" | "scopes" | "secret"
  >,
  handle: string,
): Promise<string | null> {
  if (handle.length > MAX_SESSION_HANDLE_LENGTH) return null;
  const parts = handle.split(".");
  if (parts.length !== 3 || parts[0] !== SESSION_HANDLE_VERSION) return null;
  const payloadBytes = decodeBase64Url(parts[1]!);
  const signature = decodeBase64Url(parts[2]!);
  if (!payloadBytes || !signature) return null;
  const verified = await crypto.subtle.verify(
    "HMAC",
    await importSessionKey(input.secret),
    signature,
    new TextEncoder().encode(`${SESSION_HANDLE_VERSION}.${parts[1]}`),
  );
  if (!verified) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(payloadBytes),
    ) as Partial<SessionHandlePayload>;
    if (
      payload.connectionId !== input.connectionId ||
      !Array.isArray(payload.scopes) ||
      JSON.stringify(payload.scopes) !==
        JSON.stringify(normalizedScopes(input.scopes)) ||
      typeof payload.sessionId !== "string" ||
      !payload.sessionId ||
      payload.sessionId.length > MAX_INTERNAL_SESSION_ID_LENGTH
    ) {
      return null;
    }
    return payload.sessionId;
  } catch {
    return null;
  }
}

function forbiddenSessionResponse(): Response {
  return Response.json(
    { error: "MCP session is not authorized for this connection" },
    { status: 403 },
  );
}

export async function forwardBoundMcpSession(
  input: ForwardBoundMcpSessionInput,
): Promise<Response> {
  const publicSessionId = input.request.headers.get("mcp-session-id");
  let forwardedRequest = input.request;
  if (publicSessionId) {
    const internalSessionId = await readSessionHandle(input, publicSessionId);
    if (!internalSessionId) return forbiddenSessionResponse();
    const headers = new Headers(input.request.headers);
    headers.set("mcp-session-id", internalSessionId);
    forwardedRequest = new Request(input.request, { headers });
  }

  const response = await input.fetchMcp(forwardedRequest);
  const internalResponseSessionId = response.headers.get("mcp-session-id");
  if (!internalResponseSessionId) return response;

  const headers = new Headers(response.headers);
  headers.set(
    "mcp-session-id",
    await createSessionHandle(input, internalResponseSessionId),
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
