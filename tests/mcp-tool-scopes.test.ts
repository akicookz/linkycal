import { describe, expect, test } from "bun:test";

import { MCP_TOOL_GROUPS } from "../scripts/api-docs-catalog";
import {
  MCP_TOOL_SCOPES,
  type McpToolName,
  type McpOAuthScope,
} from "../shared/mcp-tools";
import type { ToolContext } from "../worker/mcp/agent";
import { ok, withToolErrors } from "../worker/mcp/helpers";

function context(scopes: McpOAuthScope[]): ToolContext {
  return {
    projectId: function projectId() {
      return "project-scopes";
    },
    scopes: function grantedScopes() {
      return scopes;
    },
    db: function database() {
      throw new Error("database should not be used by scope tests");
    },
    env: function environment() {
      throw new Error("environment should not be used by scope tests");
    },
    waitUntil: function waitUntil() {},
  };
}

describe("MCP tool authorization scopes", function () {
  test("the canonical scope catalog classifies every documented MCP tool exactly once", function () {
    const documented = MCP_TOOL_GROUPS.flatMap(function toolNames(group) {
      return group.tools;
    }).sort();
    const classified = Object.keys(MCP_TOOL_SCOPES).sort();

    expect(classified).toHaveLength(40);
    expect(new Set(classified).size).toBe(40);
    expect(classified).toEqual(documented);
  });

  test("missing read or write scope returns an MCP error before any side effect", async function () {
    const cases: Array<{
      tool: McpToolName;
      granted: McpOAuthScope[];
      required: "read" | "write";
    }> = [
      { tool: "get_booking", granted: ["write"], required: "read" },
      { tool: "create_booking", granted: ["read"], required: "write" },
    ];

    for (const item of cases) {
      let sideEffects = 0;
      const guarded = withToolErrors(item.tool, context(item.granted), async function handler() {
        sideEffects += 1;
        return ok({ success: true });
      });

      const result = await guarded({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toBe(
        `Authorization required: ${item.required} scope`,
      );
      expect(sideEffects).toBe(0);
    }
  });

  test("matching scopes allow read and write handlers to execute", async function () {
    const cases: Array<{
      tool: McpToolName;
      granted: McpOAuthScope[];
    }> = [
      { tool: "get_booking", granted: ["read"] },
      { tool: "create_booking", granted: ["write"] },
    ];

    for (const item of cases) {
      let calls = 0;
      const guarded = withToolErrors(item.tool, context(item.granted), async function handler() {
        calls += 1;
        return ok({ success: true });
      });

      expect((await guarded({})).isError).toBeUndefined();
      expect(calls).toBe(1);
    }
  });
});
