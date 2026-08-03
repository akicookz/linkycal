import { McpAgent } from "agents/mcp";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { drizzle } from "drizzle-orm/d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import type { McpOAuthScope } from "../../shared/mcp-tools";
import * as dbSchema from "../db/schema";
import type { AppEnv } from "../types";
import type { McpOAuthProps } from "./oauth-authorization";
import { reserveProjectUsage } from "../lib/metered-entitlements";
import type { ToolResult } from "./helpers";
import { createLinkyCalMcpServer } from "./server";

const { schema } = dbSchema;

// ─── Props ───────────────────────────────────────────────────────────────────
// Set by the OAuth provider after validating the bearer token.
// projectId hard-scopes every tool in the session — it is never a tool param.

export type McpProps = McpOAuthProps;

// ─── Tool Context ────────────────────────────────────────────────────────────
// Accessors instead of values so each tool call gets a fresh drizzle instance
// (matches the services-instantiated-per-request convention) and props are
// read at call time, after the DO has hydrated them.

export interface ToolContext {
  projectId: () => string;
  scopes: () => McpOAuthScope[];
  db: () => DrizzleD1Database<Record<string, unknown>>;
  env: () => AppEnv;
  waitUntil: (p: Promise<unknown>) => void;
  reserveToolUsage?(toolName: string): Promise<ToolResult | null>;
}

// ─── Agent ───────────────────────────────────────────────────────────────────

export class LinkyCalMcp extends McpAgent<Cloudflare.Env & AppEnv, unknown, McpProps> {
  server!: McpServer;

  async init() {
    const ctx: ToolContext = {
      projectId: () => {
        const projectId = this.props?.projectId;
        if (!projectId) throw new Error("MCP session is missing projectId");
        return projectId;
      },
      scopes: () => {
        const scopes = this.props?.scopes;
        if (!scopes) throw new Error("MCP session is missing scopes");
        return scopes;
      },
      db: () => drizzle(this.env.DB, { schema }),
      env: () => this.env,
      // The DO stays alive while the event completes, so fire-and-forget with
      // error logging is safe here (no ExecutionContext.waitUntil in a DO).
      waitUntil: (p) => {
        void p.catch((err) => console.error("MCP background task failed:", err));
      },
      reserveToolUsage: async (toolName) => {
        const reservation = await reserveProjectUsage({
          db: drizzle(this.env.DB, { schema }),
          projectId: ctx.projectId(),
          key: "integrationRequests",
          channel: `mcp:${toolName}`,
          env: this.env,
        });
        return reservation.decision.allowed
          ? null
          : reservation.mcpError(`use the ${toolName} MCP tool`);
      },
    };

    this.server = createLinkyCalMcpServer(ctx);
  }
}
