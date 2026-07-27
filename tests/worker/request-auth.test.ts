import { describe, expect, test } from "bun:test";

import {
  resolveRequestAuth,
  type DashboardSession,
  type RequestAuthResult,
} from "../../worker/lib/request-auth";

const session: DashboardSession = {
  user: {
    id: "user-a",
    name: "Alice",
    email: "alice@example.com",
    image: null,
  },
  session: {
    id: "session-a",
    userId: "user-a",
    token: "secret",
    expiresAt: new Date("2030-01-01T00:00:00Z"),
  },
};

function summarizeAuthResult(
  result: RequestAuthResult,
): Record<string, unknown> {
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      code: result.code,
    };
  }
  if (result.auth.kind === "apiKey") {
    return {
      ok: true,
      kind: "apiKey",
      apiKeyId: result.auth.apiKeyId,
      projectId: result.auth.projectId,
    };
  }
  return {
    ok: true,
    kind: "session",
    userId: result.auth.user.id,
    sessionId: result.auth.session.id,
  };
}

describe("request authentication", () => {
  test("resolves the complete session and API-key precedence policy", async () => {
    const validKey = {
      apiKeyId: "key-a",
      projectId: "project-a",
    };
    const cases = [
      [
        "session without Bearer credential",
        undefined,
        "better-auth.session_token=value",
        session,
        null,
        {
          ok: true,
          kind: "session",
          userId: "user-a",
          sessionId: "session-a",
        },
      ],
      [
        "valid API key without session",
        "Bearer lc_live_valid",
        undefined,
        null,
        validKey,
        {
          ok: true,
          kind: "apiKey",
          apiKeyId: "key-a",
          projectId: "project-a",
        },
      ],
      [
        "session plus Bearer credential",
        "Bearer lc_live_valid",
        "better-auth.session_token=value",
        session,
        validKey,
        {
          ok: false,
          status: 400,
          code: "ambiguous_credentials",
        },
      ],
      [
        "malformed Bearer credential",
        "Basic secret",
        undefined,
        null,
        null,
        {
          ok: false,
          status: 401,
          code: "invalid_api_key",
        },
      ],
      [
        "unknown Bearer credential",
        "Bearer lc_live_unknown",
        undefined,
        null,
        null,
        {
          ok: false,
          status: 401,
          code: "invalid_api_key",
        },
      ],
      [
        "valid key with unrelated cookie",
        "Bearer lc_live_valid",
        "theme=light",
        null,
        validKey,
        {
          ok: true,
          kind: "apiKey",
          apiKeyId: "key-a",
          projectId: "project-a",
        },
      ],
      [
        "no credential",
        undefined,
        undefined,
        null,
        null,
        {
          ok: false,
          status: 401,
          code: "unauthorized",
        },
      ],
    ] as const;

    for (const [
      name,
      authorization,
      cookie,
      loadedSession,
      apiKeyIdentity,
      expected,
    ] of cases) {
      const result = await resolveRequestAuth({
        authorization,
        cookie,
        loadSession: async () => loadedSession,
        validateApiKey: async () => apiKeyIdentity,
      });
      expect([name, summarizeAuthResult(result)]).toEqual([name, expected]);
    }
  });
});
