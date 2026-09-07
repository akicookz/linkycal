import { afterEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { ToolContext } from "../worker/mcp/agent";
import { createLinkyCalMcpServer } from "../worker/mcp/server";
import { listForms, updateForm } from "../worker/mcp/tools/forms";
import type { AppEnv } from "../worker/types";
import { createTestDb, type TestDatabase } from "./support/test-db";
import * as dbSchema from "../worker/db/schema";

function context(testDatabase: TestDatabase): ToolContext {
  return {
    projectId: function projectId() {
      return "project-slug-contract";
    },
    scopes: function scopes() {
      return ["read", "write"];
    },
    db: function database() {
      return testDatabase.db;
    },
    env: function environment() {
      return {} as AppEnv;
    },
    waitUntil: function waitUntil() {},
  };
}

function discoveryContext(): ToolContext {
  return {
    projectId: function projectId() {
      return "project-slug-discovery";
    },
    scopes: function scopes() {
      return ["read", "write"];
    },
    db: function database() {
      throw new Error("discovery must not access the database");
    },
    env: function environment() {
      throw new Error("discovery must not access the environment");
    },
    waitUntil: function waitUntil() {},
  };
}

function parseToolJson(result: { content: Array<{ text?: string }> }): unknown {
  const text = result.content[0]?.text;
  if (!text) throw new Error("missing tool text");
  return JSON.parse(text);
}

function schemaRequiresSlug(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const node = schema as {
    required?: unknown;
    properties?: Record<string, unknown>;
    items?: unknown;
  };
  const required = Array.isArray(node.required)
    ? node.required.filter((key) => typeof key === "string")
    : [];
  if (required.includes("slug")) return true;
  if (schemaRequiresSlug(node.items)) return true;
  for (const property of Object.values(node.properties ?? {})) {
    if (schemaRequiresSlug(property)) return true;
  }
  return false;
}

describe("MCP slug contract", function () {
  let testDatabase: TestDatabase | null = null;

  afterEach(function closeDatabase() {
    testDatabase?.close();
    testDatabase = null;
  });

  test("listForms and publishing a form advertise slug on content and structuredContent", async function () {
    testDatabase = createTestDb();
    await testDatabase.db.insert(dbSchema.schema.users).values({
      id: "owner-slug-contract",
      name: "Slug owner",
      email: "slug@example.com",
    });
    await testDatabase.db.insert(dbSchema.projects).values({
      id: "project-slug-contract",
      userId: "owner-slug-contract",
      name: "Slug project",
      slug: "slug-project",
    });
    await testDatabase.db.insert(dbSchema.forms).values({
      id: "form-slug-contract",
      projectId: "project-slug-contract",
      name: "Intake",
      slug: "intake",
      type: "single",
      status: "draft",
    });

    const listed = await listForms(context(testDatabase));
    const listedBody = parseToolJson(listed);
    const listedForms = Array.isArray(listedBody)
      ? listedBody
      : (listedBody as { forms?: Array<{ slug?: string }> }).forms;

    expect(listed.isError).toBeUndefined();
    expect(listedForms?.[0]?.slug).toBe("intake");
    expect(listed.structuredContent).toEqual(listedBody);

    const published = await updateForm(context(testDatabase), {
      formId: "form-slug-contract",
      status: "active",
    });
    const publishedBody = parseToolJson(published) as { slug?: string; status?: string };

    expect(published.isError).toBeUndefined();
    expect(publishedBody.slug).toBe("intake");
    expect(publishedBody.status).toBe("active");
    expect(published.structuredContent).toEqual(publishedBody);
  });

  test("tools/list requires slug on form success and names slug on list_forms", async function () {
    const server = createLinkyCalMcpServer(discoveryContext());
    const client = new Client({ name: "slug-contract", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const { tools } = await client.listTools();
      const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

      expect(byName.list_forms?.description).toContain("slug");
      expect(schemaRequiresSlug(byName.list_forms?.outputSchema)).toBe(true);
      expect(schemaRequiresSlug(byName.get_form?.outputSchema)).toBe(true);
      expect(schemaRequiresSlug(byName.create_form?.outputSchema)).toBe(true);
      expect(schemaRequiresSlug(byName.update_form?.outputSchema)).toBe(true);
      expect(schemaRequiresSlug(byName.list_event_types?.outputSchema)).toBe(true);
      expect(schemaRequiresSlug(byName.get_event_type?.outputSchema)).toBe(true);
      expect(schemaRequiresSlug(byName.create_event_type?.outputSchema)).toBe(true);
      expect(schemaRequiresSlug(byName.update_event_type?.outputSchema)).toBe(true);
      expect(schemaRequiresSlug(byName.get_project?.outputSchema)).toBe(true);
      expect(schemaRequiresSlug(byName.update_project?.outputSchema)).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
