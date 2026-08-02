import { describe, expect, test } from "bun:test";
import type {
  AuthRequest,
  ClientInfo,
  CompleteAuthorizationOptions,
  GrantSummary,
} from "@cloudflare/workers-oauth-provider";

import * as dbSchema from "../worker/db/schema";
import {
  decideMcpAuthorization,
  listMcpConnections,
  loadMcpAuthorizationContext,
  resolveAuthorizationMcpScopes,
  resolveEffectiveMcpTokenScopes,
  revokeMcpConnection,
  type McpOAuthHelpers,
} from "../worker/mcp/oauth-authorization";
import { McpOAuthGrantService } from "../worker/services/mcp-oauth-grant-service";
import { mcpOAuthDecisionSchema } from "../worker/validation";
import { createTestDb, type TestDatabase } from "./support/test-db";

const CLIENT: ClientInfo = {
  clientId: "client-registered",
  clientName: "Claude\u0000 Desktop with an unnecessarily long client name that should be bounded before it reaches the project audit screen",
  redirectUris: ["https://client.example/callback"],
  tokenEndpointAuthMethod: "none",
};

function authRequest(scopes: string[] = ["read", "write"]): AuthRequest {
  return {
    responseType: "code",
    clientId: CLIENT.clientId,
    redirectUri: CLIENT.redirectUris[0]!,
    scope: scopes,
    state: "state-123",
    codeChallenge: "challenge-123",
    codeChallengeMethod: "S256",
    resource: "https://linkycal.com/api/mcp",
  };
}

class FakeOAuthHelpers implements McpOAuthHelpers {
  request = authRequest();
  client: ClientInfo | null = CLIENT;
  grants: GrantSummary[] = [];
  completed: CompleteAuthorizationOptions[] = [];
  revoked: string[] = [];
  rejectRevocation = false;

  async parseAuthRequest(): Promise<AuthRequest> {
    return this.request;
  }

  async lookupClient(): Promise<ClientInfo | null> {
    return this.client;
  }

  async completeAuthorization(
    options: CompleteAuthorizationOptions,
  ): Promise<{ redirectTo: string }> {
    this.completed.push(options);
    this.grants.push({
      id: `provider-${String(options.metadata.connectionId)}`,
      clientId: options.request.clientId,
      userId: options.userId,
      scope: options.scope,
      metadata: options.metadata,
      createdAt: Math.floor(Date.now() / 1000),
    });
    return {
      redirectTo:
        "https://client.example/callback?code=fake-code&state=state-123",
    };
  }

  async listUserGrants(
    userId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ items: GrantSummary[]; cursor?: string }> {
    const matching = this.grants.filter(function ownedGrant(grant) {
      return grant.userId === userId;
    });
    const start = Number(options.cursor ?? "0");
    const limit = options.limit ?? 100;
    const items = matching.slice(start, start + limit);
    const next = start + items.length;
    return {
      items,
      cursor: next < matching.length ? String(next) : undefined,
    };
  }

  async revokeGrant(grantId: string): Promise<void> {
    if (this.rejectRevocation) {
      throw new Error("provider revocation failed");
    }
    this.revoked.push(grantId);
    this.grants = this.grants.filter(function retainGrant(grant) {
      return grant.id !== grantId;
    });
  }
}

async function seedAuthorizationProjects(
  testDatabase: TestDatabase,
): Promise<void> {
  await testDatabase.db.insert(dbSchema.schema.users).values([
    {
      id: "oauth-authorizer",
      name: "OAuth Authorizer",
      email: "authorizer@example.com",
    },
    {
      id: "oauth-team-owner",
      name: "Team Owner",
      email: "team-owner@example.com",
    },
    {
      id: "oauth-hidden-owner",
      name: "Hidden Owner",
      email: "hidden@example.com",
    },
  ]);
  await testDatabase.db.insert(dbSchema.teams).values({
    id: "oauth-free-team",
    ownerUserId: "oauth-team-owner",
    name: "Free Team",
    slug: "oauth-free-team",
  });
  await testDatabase.db.insert(dbSchema.teamMembers).values({
    id: "oauth-free-admin-membership",
    teamId: "oauth-free-team",
    userId: "oauth-authorizer",
    role: "admin",
  });
  await testDatabase.db.insert(dbSchema.projects).values([
    {
      id: "oauth-paid-project",
      userId: "oauth-authorizer",
      name: "Paid Project",
      slug: "oauth-paid-project",
    },
    {
      id: "oauth-free-project",
      userId: "oauth-team-owner",
      teamId: "oauth-free-team",
      name: "Free Project",
      slug: "oauth-free-project",
    },
    {
      id: "oauth-hidden-project",
      userId: "oauth-hidden-owner",
      name: "Hidden Project",
      slug: "oauth-hidden-project",
    },
  ]);
  await testDatabase.db.insert(dbSchema.subscriptions).values({
    id: "oauth-paid-subscription",
    userId: "oauth-authorizer",
    plan: "pro",
    status: "active",
  });
}

describe("MCP OAuth authorization", function () {
  test("browser decisions cannot supply user, client, scope, or redirect identities", function () {
    expect(
      mcpOAuthDecisionSchema.parse({
        decision: "approve",
        projectId: "oauth-paid-project",
      }),
    ).toEqual({ decision: "approve", projectId: "oauth-paid-project" });
    expect(function injectedIdentity() {
      mcpOAuthDecisionSchema.parse({
        decision: "approve",
        projectId: "oauth-paid-project",
        userId: "attacker",
      });
    }).toThrow();
    expect(mcpOAuthDecisionSchema.parse({ decision: "deny" })).toEqual({
      decision: "deny",
    });
  });

  test("scope resolution defaults only initial authorization and preserves token downscoping exactly", function () {
    expect(resolveAuthorizationMcpScopes([])).toEqual(["read", "write"]);
    expect(resolveAuthorizationMcpScopes(["read"])).toEqual(["read"]);
    expect(
      resolveAuthorizationMcpScopes(["write", "offline_access"]),
    ).toEqual(["write", "offline_access"]);
    expect(resolveEffectiveMcpTokenScopes(["offline_access"])).toEqual([
      "offline_access",
    ]);
    expect(resolveEffectiveMcpTokenScopes(["read"])).toEqual(["read"]);
    expect(function unsupportedScope() {
      resolveAuthorizationMcpScopes(["read", "admin"]);
    }).toThrow("Unsupported OAuth scope: admin");
  });

  test("consent exposes only paid projects where the current user is an administrator", async function () {
    const testDatabase = createTestDb();
    const oauth = new FakeOAuthHelpers();
    try {
      await seedAuthorizationProjects(testDatabase);

      const context = await loadMcpAuthorizationContext({
        db: testDatabase.db,
        oauth,
        request: new Request("https://linkycal.com/oauth/authorize"),
        userId: "oauth-authorizer",
      });

      expect(context.projects).toEqual([
        { id: "oauth-paid-project", name: "Paid Project" },
      ]);
      expect(context.scopes).toEqual(["read", "write"]);
      expect(context.clientName.startsWith("Claude Desktop")).toBe(true);
      expect(context.clientName.length).toBeLessThanOrEqual(80);
      expect(context.clientName).not.toContain("\u0000");
    } finally {
      testDatabase.close();
    }
  });

  test("approval rechecks the project and records one concurrent project grant before redirecting", async function () {
    const testDatabase = createTestDb();
    const oauth = new FakeOAuthHelpers();
    try {
      await seedAuthorizationProjects(testDatabase);

      const redirectTo = await decideMcpAuthorization({
        db: testDatabase.db,
        oauth,
        request: new Request("https://linkycal.com/oauth/authorize"),
        userId: "oauth-authorizer",
        decision: { decision: "approve", projectId: "oauth-paid-project" },
        createConnectionId: function connectionId() {
          return "connection-approved";
        },
      });

      expect(redirectTo).toBe(
        "https://client.example/callback?code=fake-code&state=state-123",
      );
      expect(oauth.completed).toHaveLength(1);
      expect(oauth.completed[0]).toMatchObject({
        userId: "oauth-authorizer",
        scope: ["read", "write"],
        metadata: {
          connectionId: "connection-approved",
          projectId: "oauth-paid-project",
        },
        props: {
          connectionId: "connection-approved",
          userId: "oauth-authorizer",
          projectId: "oauth-paid-project",
          scopes: ["read", "write"],
        },
        revokeExistingGrants: false,
      });
      expect(
        await new McpOAuthGrantService(testDatabase.db).getActive(
          "connection-approved",
        ),
      ).toMatchObject({
        projectId: "oauth-paid-project",
        userId: "oauth-authorizer",
        clientId: CLIENT.clientId,
      });
    } finally {
      testDatabase.close();
    }
  });

  test("a D1 failure revokes the just-created provider grant and withholds the redirect", async function () {
    const testDatabase = createTestDb();
    const oauth = new FakeOAuthHelpers();
    try {
      await seedAuthorizationProjects(testDatabase);
      await new McpOAuthGrantService(testDatabase.db).create({
        id: "connection-collision",
        projectId: "oauth-paid-project",
        userId: "oauth-authorizer",
        clientId: "existing-client",
        clientName: "Existing client",
        scopes: ["read"],
      });

      await expect(
        decideMcpAuthorization({
          db: testDatabase.db,
          oauth,
          request: new Request("https://linkycal.com/oauth/authorize"),
          userId: "oauth-authorizer",
          decision: { decision: "approve", projectId: "oauth-paid-project" },
          createConnectionId: function collidingConnectionId() {
            return "connection-collision";
          },
        }),
      ).rejects.toThrow();
      expect(oauth.revoked).toEqual(["provider-connection-collision"]);
    } finally {
      testDatabase.close();
    }
  });

  test("denial redirects only to the registered URI and preserves state", async function () {
    const testDatabase = createTestDb();
    const oauth = new FakeOAuthHelpers();
    try {
      const redirectTo = await decideMcpAuthorization({
        db: testDatabase.db,
        oauth,
        request: new Request("https://linkycal.com/oauth/authorize"),
        userId: "oauth-authorizer",
        decision: { decision: "deny" },
      });
      expect(redirectTo).toBe(
        "https://client.example/callback?error=access_denied&state=state-123",
      );

      oauth.request = {
        ...oauth.request,
        redirectUri: "https://attacker.example/callback",
      };
      await expect(
        decideMcpAuthorization({
          db: testDatabase.db,
          oauth,
          request: new Request("https://linkycal.com/oauth/authorize"),
          userId: "oauth-authorizer",
          decision: { decision: "deny" },
        }),
      ).rejects.toThrow("Invalid OAuth redirect URI");
    } finally {
      testDatabase.close();
    }
  });

  test("connection listing removes D1 rows whose provider grant expired", async function () {
    const testDatabase = createTestDb();
    const oauth = new FakeOAuthHelpers();
    const service = new McpOAuthGrantService(testDatabase.db);
    try {
      await seedAuthorizationProjects(testDatabase);
      for (const id of ["connection-live", "connection-stale"]) {
        await service.create({
          id,
          projectId: "oauth-paid-project",
          userId: "oauth-authorizer",
          clientId: CLIENT.clientId,
          clientName: "Claude",
          scopes: ["read", "write"],
        });
      }
      oauth.grants.push({
        id: "provider-live",
        clientId: CLIENT.clientId,
        userId: "oauth-authorizer",
        scope: ["read", "write"],
        metadata: { connectionId: "connection-live" },
        createdAt: Math.floor(Date.now() / 1000),
      });

      const connections = await listMcpConnections({
        db: testDatabase.db,
        oauth,
        projectId: "oauth-paid-project",
      });

      expect(connections.map(function connectionId(item) {
        return item.id;
      })).toEqual(["connection-live"]);
      expect(await service.getActive("connection-stale")).toBeNull();
    } finally {
      testDatabase.close();
    }
  });

  test("revocation invalidates the provider before marking the project index", async function () {
    const testDatabase = createTestDb();
    const oauth = new FakeOAuthHelpers();
    const service = new McpOAuthGrantService(testDatabase.db);
    try {
      await seedAuthorizationProjects(testDatabase);
      await service.create({
        id: "connection-revoke-order",
        projectId: "oauth-paid-project",
        userId: "oauth-authorizer",
        clientId: CLIENT.clientId,
        clientName: "Claude",
        scopes: ["read", "write"],
      });
      oauth.grants.push({
        id: "provider-revoke-order",
        clientId: CLIENT.clientId,
        userId: "oauth-authorizer",
        scope: ["read", "write"],
        metadata: { connectionId: "connection-revoke-order" },
        createdAt: Math.floor(Date.now() / 1000),
      });
      oauth.rejectRevocation = true;

      await expect(
        revokeMcpConnection({
          db: testDatabase.db,
          oauth,
          projectId: "oauth-paid-project",
          connectionId: "connection-revoke-order",
        }),
      ).rejects.toThrow("provider revocation failed");
      expect(await service.getActive("connection-revoke-order")).not.toBeNull();

      oauth.rejectRevocation = false;
      await revokeMcpConnection({
        db: testDatabase.db,
        oauth,
        projectId: "oauth-paid-project",
        connectionId: "connection-revoke-order",
      });
      expect(oauth.revoked).toEqual(["provider-revoke-order"]);
      expect(await service.getActive("connection-revoke-order")).toBeNull();
    } finally {
      testDatabase.close();
    }
  });
});
