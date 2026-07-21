import type { ApiKeyIdentity } from "../services/api-key-service";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DashboardSession {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
  };
}

export type RequestAuth =
  | ({ kind: "session" } & DashboardSession)
  | ({ kind: "apiKey" } & ApiKeyIdentity);

export interface AuthFailure {
  ok: false;
  status: 400 | 401;
  code: "ambiguous_credentials" | "invalid_api_key" | "unauthorized";
  error: string;
}

interface ResolveRequestAuthOptions {
  authorization?: string;
  cookie?: string;
  loadSession: () => Promise<DashboardSession | null>;
  validateApiKey: (key: string) => Promise<ApiKeyIdentity | null>;
}

export type RequestAuthResult =
  | { ok: true; auth: RequestAuth }
  | AuthFailure;

// ─── Credential Resolution ──────────────────────────────────────────────────

function parseBearer(authorization: string): string | null {
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

export async function resolveRequestAuth(
  options: ResolveRequestAuthOptions,
): Promise<RequestAuthResult> {
  const hasAuthorization = options.authorization !== undefined;
  const session = options.cookie ? await options.loadSession() : null;

  if (session && hasAuthorization) {
    return {
      ok: false,
      status: 400,
      code: "ambiguous_credentials",
      error: "Send either a dashboard session or an API key, not both",
    };
  }

  if (hasAuthorization) {
    const key = parseBearer(options.authorization ?? "");
    const identity = key ? await options.validateApiKey(key) : null;
    if (!identity) {
      return {
        ok: false,
        status: 401,
        code: "invalid_api_key",
        error: "Missing or invalid API key",
      };
    }

    return { ok: true, auth: { kind: "apiKey", ...identity } };
  }

  if (session) {
    return { ok: true, auth: { kind: "session", ...session } };
  }

  return {
    ok: false,
    status: 401,
    code: "unauthorized",
    error: "Unauthorized",
  };
}
