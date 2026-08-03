import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import {
  MCP_TOOL_SCOPES,
  type McpOAuthScope,
} from "../shared/mcp-tools";
import type { ToolContext } from "../worker/mcp/agent";
import { createLinkyCalMcpServer } from "../worker/mcp/server";

const EXPECTED_MCP_TOOL_IDS = [
  "list_bookings",
  "get_booking",
  "get_available_slots",
  "create_booking",
  "cancel_booking",
  "confirm_booking",
  "decline_booking",
  "list_event_types",
  "get_event_type",
  "create_event_type",
  "update_event_type",
  "list_schedules",
  "get_schedule",
  "list_contacts",
  "get_contact",
  "create_contact",
  "update_contact",
  "set_contact_next_action",
  "complete_contact_next_action",
  "delete_contact",
  "list_contact_tags",
  "get_contact_tag",
  "create_contact_tag",
  "update_contact_tag",
  "delete_contact_tag",
  "add_tag_to_contact",
  "remove_tag_from_contact",
  "get_contact_activity",
  "list_forms",
  "get_form",
  "create_form",
  "update_form",
  "list_form_responses",
  "list_workflows",
  "get_workflow",
  "get_analytics_overview",
  "get_booking_funnel_analytics",
  "get_form_funnel_analytics",
  "list_analytics_integrations",
  "configure_analytics_integration",
] as const;

const EXPECTED_WRITE_ANNOTATIONS = {
  create_booking: [false, false, true],
  cancel_booking: [true, false, true],
  confirm_booking: [true, false, true],
  decline_booking: [true, false, true],
  create_event_type: [false, false, false],
  update_event_type: [true, true, false],
  create_contact: [false, false, true],
  update_contact: [true, true, false],
  set_contact_next_action: [true, false, false],
  complete_contact_next_action: [true, true, false],
  delete_contact: [true, false, false],
  create_contact_tag: [false, false, false],
  update_contact_tag: [true, true, false],
  delete_contact_tag: [true, false, false],
  add_tag_to_contact: [false, true, true],
  remove_tag_from_contact: [true, true, false],
  create_form: [false, false, false],
  update_form: [true, true, false],
  configure_analytics_integration: [true, true, false],
} as const;

function context(): ToolContext {
  return {
    projectId: function projectId() {
      return "project-discovery";
    },
    scopes: function scopes(): McpOAuthScope[] {
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

describe("MCP client discovery", function () {
  test("initialization teaches clients how to discover and safely use LinkyCal tools", async function () {
    const server = createLinkyCalMcpServer(context());
    const client = new Client({ name: "discovery-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const instructions = client.getInstructions();

      expect(instructions).toContain("## Tool discovery");
      expect(instructions).toContain("### Read tools");
      expect(instructions).toContain("### Write tools");
      expect(instructions).toContain("Never invent resource IDs");
      expect(instructions).toContain(
        "list_event_types → get_available_slots → create_booking",
      );
      expect(instructions).toContain(
        "list_contacts → list_contact_tags → add_tag_to_contact",
      );
      expect(instructions).toContain("https://linkycal.com/docs");
      expect(instructions).toContain("https://linkycal.com/llms.txt");
      expect(instructions).toContain("https://linkycal.com/openapi.json");
    } finally {
      await client.close();
      await server.close();
    }
  });

  test("tools/list exposes every authorization scope as a read or write discovery group", async function () {
    const server = createLinkyCalMcpServer(context());
    const client = new Client({ name: "discovery-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const { tools } = await client.listTools();

      expect(tools.map((tool) => tool.name).sort()).toEqual(
        [...EXPECTED_MCP_TOOL_IDS].sort(),
      );
      for (const tool of tools) {
        const scope = MCP_TOOL_SCOPES[tool.name as keyof typeof MCP_TOOL_SCOPES];
        expect(scope).toBeDefined();
        expect(tool.title).toStartWith(scope === "read" ? "Read · " : "Write · ");
        expect(tool.annotations?.readOnlyHint).toBe(scope === "read");
        expect(tool.annotations?.destructiveHint).toBeBoolean();
        expect(tool.annotations?.idempotentHint).toBeBoolean();
        expect(tool.annotations?.openWorldHint).toBeBoolean();
      }

      const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
      expect(byName.get_booking?.title).toBe("Read · Bookings · Get booking");
      expect(byName.create_booking?.title).toBe(
        "Write · Bookings · Create booking",
      );
      expect(byName.get_available_slots?.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });

      for (const [name, hints] of Object.entries(EXPECTED_WRITE_ANNOTATIONS)) {
        expect(byName[name]?.annotations).toMatchObject({
          readOnlyHint: false,
          destructiveHint: hints[0],
          idempotentHint: hints[1],
          openWorldHint: hints[2],
        });
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});
