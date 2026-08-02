import { describe, expect, test } from "bun:test";

import * as dbSchema from "../worker/db/schema";
import { authorizeMcpRequest } from "../worker/mcp/access";
import type { McpOAuthProps } from "../worker/mcp/oauth-authorization";
import { McpOAuthGrantService } from "../worker/services/mcp-oauth-grant-service";
import { createTestDb, type TestDatabase } from "./support/test-db";

interface SeedOptions {
  plan?: "free" | "pro";
  revoked?: boolean;
  access?: "legacy-owner" | "none" | "admin" | "editor" | "viewer";
  mismatchedProject?: boolean;
}

async function seedAccess(
  testDatabase: TestDatabase,
  options: SeedOptions = {},
): Promise<McpOAuthProps> {
  const access = options.access ?? "legacy-owner";
  await testDatabase.db.insert(dbSchema.schema.users).values([
    {
      id: "runtime-user",
      name: "Runtime User",
      email: "runtime@example.com",
    },
    {
      id: "runtime-owner",
      name: "Runtime Owner",
      email: "runtime-owner@example.com",
    },
  ]);

  let projectUserId = "runtime-user";
  let teamId: string | null = null;
  if (access !== "legacy-owner" && access !== "none") {
    projectUserId = "runtime-owner";
    teamId = "runtime-team";
    await testDatabase.db.insert(dbSchema.teams).values({
      id: teamId,
      ownerUserId: "runtime-owner",
      name: "Runtime Team",
      slug: `runtime-team-${access}`,
    });
    await testDatabase.db.insert(dbSchema.teamMembers).values([
      {
        id: "runtime-owner-membership",
        teamId,
        userId: "runtime-owner",
        role: "owner",
      },
      {
        id: "runtime-user-membership",
        teamId,
        userId: "runtime-user",
        role: access === "admin" ? "admin" : "member",
      },
    ]);
  } else if (access === "none") {
    projectUserId = "runtime-owner";
  }

  await testDatabase.db.insert(dbSchema.projects).values({
    id: "runtime-project",
    userId: projectUserId,
    teamId,
    name: "Runtime Project",
    slug: `runtime-project-${access}`,
  });
  if (access === "editor" || access === "viewer") {
    await testDatabase.db.insert(dbSchema.projectMembers).values({
      id: `runtime-project-member-${access}`,
      projectId: "runtime-project",
      teamMemberId: "runtime-user-membership",
      role: access,
    });
  }

  if ((options.plan ?? "pro") === "pro") {
    await testDatabase.db.insert(dbSchema.subscriptions).values({
      id: "runtime-subscription",
      userId: "runtime-owner",
      teamId,
      plan: "pro",
      status: "active",
    });
    if (access === "legacy-owner") {
      await testDatabase.db
        .update(dbSchema.subscriptions)
        .set({ userId: "runtime-user" });
    }
  }

  await new McpOAuthGrantService(testDatabase.db).create({
    id: "runtime-connection",
    projectId: "runtime-project",
    userId: "runtime-user",
    clientId: "runtime-client",
    clientName: "Runtime client",
    scopes: ["read", "write"],
  });
  if (options.revoked) {
    await new McpOAuthGrantService(testDatabase.db).markRevoked(
      "runtime-connection",
      "runtime-project",
    );
  }

  if (options.mismatchedProject) {
    await testDatabase.db.insert(dbSchema.projects).values({
      id: "runtime-other-project",
      userId: "runtime-user",
      name: "Other Runtime Project",
      slug: "runtime-other-project",
    });
  }

  return {
    connectionId: "runtime-connection",
    userId: "runtime-user",
    projectId: options.mismatchedProject
      ? "runtime-other-project"
      : "runtime-project",
    scopes: ["read", "write"],
  };
}

describe("MCP OAuth runtime access", function () {
  test("an active paid project administrator is authorized with or without a trusted LinkyCal Origin", async function () {
    const testDatabase = createTestDb();
    try {
      const props = await seedAccess(testDatabase);
      const trusted = new Set(["https://linkycal.com"]);

      expect(
        await authorizeMcpRequest(testDatabase.db, props, null, trusted),
      ).toEqual({ allowed: true, props });
      expect(
        await authorizeMcpRequest(
          testDatabase.db,
          props,
          "https://linkycal.com",
          trusted,
        ),
      ).toEqual({ allowed: true, props });
    } finally {
      testDatabase.close();
    }
  });

  test("revocation, lost administration, downgrade, project mismatch, and untrusted Origin stop access", async function () {
    const cases: Array<{
      label: string;
      options: SeedOptions;
      origin?: string;
      error: string;
    }> = [
      {
        label: "revoked connection",
        options: { revoked: true },
        error: "MCP connection is no longer active",
      },
      {
        label: "removed user",
        options: { access: "none" },
        error: "MCP project access is no longer authorized",
      },
      {
        label: "demoted editor",
        options: { access: "editor" },
        error: "MCP project access is no longer authorized",
      },
      {
        label: "demoted viewer",
        options: { access: "viewer" },
        error: "MCP project access is no longer authorized",
      },
      {
        label: "Free downgrade",
        options: { plan: "free" },
        error: "MCP API access is not available on this plan",
      },
      {
        label: "connection/project mismatch",
        options: { mismatchedProject: true },
        error: "MCP connection is no longer active",
      },
      {
        label: "untrusted browser Origin",
        options: {},
        origin: "https://attacker.example",
        error: "MCP request Origin is not allowed",
      },
    ];

    for (const item of cases) {
      const testDatabase = createTestDb();
      try {
        const props = await seedAccess(testDatabase, item.options);
        let handlerCalls = 0;
        const result = await authorizeMcpRequest(
          testDatabase.db,
          props,
          item.origin ?? null,
          new Set(["https://linkycal.com"]),
        );
        if (result.allowed) handlerCalls += 1;

        expect(result, item.label).toEqual({
          allowed: false,
          status: 403,
          error: item.error,
        });
        expect(handlerCalls, item.label).toBe(0);
      } finally {
        testDatabase.close();
      }
    }
  });
});
