import { describe, expect, test } from "bun:test";

import * as dbSchema from "../worker/db/schema";
import { McpOAuthGrantService } from "../worker/services/mcp-oauth-grant-service";
import { createTestDb } from "./support/test-db";

describe("MCP OAuth connection registry", function () {
  test("project administrators see only active project grants with authorizer audit details", async function () {
    const testDatabase = createTestDb();
    const service = new McpOAuthGrantService(testDatabase.db);

    try {
      await testDatabase.db.insert(dbSchema.schema.users).values([
        {
          id: "user-grant-a",
          name: "Ada Admin",
          email: "ada@example.com",
        },
        {
          id: "user-grant-b",
          name: "Ben Builder",
          email: "ben@example.com",
        },
      ]);
      await testDatabase.db.insert(dbSchema.projects).values([
        {
          id: "project-grant-a",
          userId: "user-grant-a",
          name: "Alpha",
          slug: "alpha-grants",
        },
        {
          id: "project-grant-b",
          userId: "user-grant-b",
          name: "Beta",
          slug: "beta-grants",
        },
      ]);

      await service.create({
        id: "connection-old",
        projectId: "project-grant-a",
        userId: "user-grant-a",
        clientId: "claude-client",
        clientName: "Claude",
        scopes: ["read", "write"],
        createdAt: new Date("2026-07-20T10:00:00.000Z"),
      });
      await service.create({
        id: "connection-new",
        projectId: "project-grant-a",
        userId: "user-grant-b",
        clientId: "cursor-client",
        clientName: "Cursor",
        scopes: ["read"],
        createdAt: new Date("2026-07-23T12:00:00.000Z"),
      });
      await service.create({
        id: "connection-revoked",
        projectId: "project-grant-b",
        userId: "user-grant-b",
        clientId: "chatgpt-client",
        clientName: "ChatGPT",
        scopes: ["read", "write", "offline_access"],
        createdAt: new Date("2026-07-24T12:00:00.000Z"),
      });
      expect(
        await service.markRevoked(
          "connection-revoked",
          "project-grant-b",
        ),
      ).toBe(true);

      expect(await service.listActiveForProject("project-grant-a")).toEqual([
        {
          id: "connection-new",
          clientName: "Cursor",
          scopes: ["read"],
          createdAt: "2026-07-23T12:00:00.000Z",
          authorizedBy: {
            name: "Ben Builder",
            email: "ben@example.com",
          },
        },
        {
          id: "connection-old",
          clientName: "Claude",
          scopes: ["read", "write"],
          createdAt: "2026-07-20T10:00:00.000Z",
          authorizedBy: {
            name: "Ada Admin",
            email: "ada@example.com",
          },
        },
      ]);
      expect(await service.getActive("connection-revoked")).toBeNull();
    } finally {
      testDatabase.close();
    }
  });

  test("revocation is project scoped and idempotent for the owning project", async function () {
    const testDatabase = createTestDb();
    const service = new McpOAuthGrantService(testDatabase.db);

    try {
      await testDatabase.db.insert(dbSchema.schema.users).values({
        id: "user-revoke",
        name: "Rae Revoker",
        email: "rae@example.com",
      });
      await testDatabase.db.insert(dbSchema.projects).values([
        {
          id: "project-revoke-a",
          userId: "user-revoke",
          name: "Revoke A",
          slug: "revoke-a",
        },
        {
          id: "project-revoke-b",
          userId: "user-revoke",
          name: "Revoke B",
          slug: "revoke-b",
        },
      ]);
      await service.create({
        id: "connection-project-a",
        projectId: "project-revoke-a",
        userId: "user-revoke",
        clientId: "lovable-client",
        clientName: "Lovable",
        scopes: ["read", "write"],
      });

      expect(
        await service.markRevoked(
          "connection-project-a",
          "project-revoke-b",
        ),
      ).toBe(false);
      expect(await service.getActive("connection-project-a")).not.toBeNull();

      expect(
        await service.markRevoked(
          "connection-project-a",
          "project-revoke-a",
        ),
      ).toBe(true);
      expect(
        await service.markRevoked(
          "connection-project-a",
          "project-revoke-a",
        ),
      ).toBe(true);
      expect(await service.getActive("connection-project-a")).toBeNull();
    } finally {
      testDatabase.close();
    }
  });
});
