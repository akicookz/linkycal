import { describe, expect, test } from "bun:test";

import { resolveRequestAuth } from "../../worker/lib/request-auth";

const session = {
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

describe("request authentication", () => {
  test("uses a session when no Bearer credential exists", async () => {
    const result = await resolveRequestAuth({
      authorization: undefined,
      cookie: "better-auth.session_token=value",
      loadSession: async () => session,
      validateApiKey: async () => null,
    });

    expect(result).toEqual({
      ok: true,
      auth: { kind: "session", ...session },
    });
  });

  test("uses a valid API key when no valid session exists", async () => {
    const result = await resolveRequestAuth({
      authorization: "Bearer lc_live_valid",
      cookie: undefined,
      loadSession: async () => null,
      validateApiKey: async () => ({
        apiKeyId: "key-a",
        projectId: "project-a",
      }),
    });

    expect(result).toEqual({
      ok: true,
      auth: {
        kind: "apiKey",
        apiKeyId: "key-a",
        projectId: "project-a",
      },
    });
  });

  test("rejects a valid session plus any Bearer credential", async () => {
    const result = await resolveRequestAuth({
      authorization: "Bearer lc_live_valid",
      cookie: "better-auth.session_token=value",
      loadSession: async () => session,
      validateApiKey: async () => ({
        apiKeyId: "key-a",
        projectId: "project-a",
      }),
    });

    expect(result).toMatchObject({
      ok: false,
      status: 400,
      code: "ambiguous_credentials",
    });
  });

  test("rejects malformed Bearer credentials without session fallback", async () => {
    const result = await resolveRequestAuth({
      authorization: "Basic secret",
      cookie: undefined,
      loadSession: async () => null,
      validateApiKey: async () => null,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 401,
      code: "invalid_api_key",
    });
  });

  test("rejects unknown Bearer credentials without session fallback", async () => {
    const result = await resolveRequestAuth({
      authorization: "Bearer lc_live_unknown",
      cookie: undefined,
      loadSession: async () => null,
      validateApiKey: async () => null,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 401,
      code: "invalid_api_key",
    });
  });

  test("uses a valid key when an unrelated cookie has no session", async () => {
    const result = await resolveRequestAuth({
      authorization: "Bearer lc_live_valid",
      cookie: "theme=light",
      loadSession: async () => null,
      validateApiKey: async () => ({
        apiKeyId: "key-a",
        projectId: "project-a",
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      auth: { kind: "apiKey" },
    });
  });

  test("rejects a protected request without either credential", async () => {
    const result = await resolveRequestAuth({
      authorization: undefined,
      cookie: undefined,
      loadSession: async () => null,
      validateApiKey: async () => null,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 401,
      code: "unauthorized",
    });
  });
});
