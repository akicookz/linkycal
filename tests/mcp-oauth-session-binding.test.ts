import { describe, expect, test } from "bun:test";

import { forwardBoundMcpSession } from "../worker/mcp/session-binding";

describe("MCP OAuth session binding", function () {
  test("a signed session handle works only for the OAuth connection that initialized it", async function () {
    const secret = "session-binding-test-secret";
    const internalSessionId = "durable-object-session-a";
    const initializeResponse = await forwardBoundMcpSession({
      request: new Request("https://linkycal.com/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      connectionId: "connection-a",
      scopes: ["read", "write"],
      secret,
      fetchMcp: async function initialize(request) {
        expect(request.headers.get("mcp-session-id")).toBeNull();
        return new Response("initialized", {
          headers: { "mcp-session-id": internalSessionId },
        });
      },
    });
    const signedSessionId = initializeResponse.headers.get("mcp-session-id");
    expect(signedSessionId).toBeString();
    expect(signedSessionId).not.toBe(internalSessionId);

    let sameConnectionCalls = 0;
    const sameConnectionResponse = await forwardBoundMcpSession({
      request: new Request("https://linkycal.com/api/mcp", {
        headers: { "mcp-session-id": signedSessionId! },
      }),
      connectionId: "connection-a",
      scopes: ["write", "read"],
      secret,
      fetchMcp: async function resume(request) {
        sameConnectionCalls += 1;
        expect(request.headers.get("mcp-session-id")).toBe(internalSessionId);
        return new Response(null, { status: 202 });
      },
    });
    expect(sameConnectionResponse.status).toBe(202);
    expect(sameConnectionCalls).toBe(1);

    let otherConnectionCalls = 0;
    const otherConnectionResponse = await forwardBoundMcpSession({
      request: new Request("https://linkycal.com/api/mcp", {
        headers: { "mcp-session-id": signedSessionId! },
      }),
      connectionId: "connection-b",
      scopes: ["read", "write"],
      secret,
      fetchMcp: async function forbiddenReuse() {
        otherConnectionCalls += 1;
        return new Response(null, { status: 202 });
      },
    });
    expect(otherConnectionResponse.status).toBe(403);
    expect(otherConnectionCalls).toBe(0);

    const downscopedResponse = await forwardBoundMcpSession({
      request: new Request("https://linkycal.com/api/mcp", {
        headers: { "mcp-session-id": signedSessionId! },
      }),
      connectionId: "connection-a",
      scopes: ["read"],
      secret,
      fetchMcp: async function forbiddenScopeReuse() {
        throw new Error("downscoped tokens must not reuse broader sessions");
      },
    });
    expect(downscopedResponse.status).toBe(403);

    const tamperedResponse = await forwardBoundMcpSession({
      request: new Request("https://linkycal.com/api/mcp", {
        headers: { "mcp-session-id": `${signedSessionId}x` },
      }),
      connectionId: "connection-a",
      scopes: ["read", "write"],
      secret,
      fetchMcp: async function forbiddenTamper() {
        throw new Error("tampered sessions must not reach the MCP transport");
      },
    });
    expect(tamperedResponse.status).toBe(403);
  });
});
