import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { drizzle } from "drizzle-orm/d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as dbSchema from "../db/schema";
import type { AppEnv } from "../types";
import { registerBookingTools } from "./tools/bookings";
import { registerContactTools } from "./tools/contacts";
import { registerEventTypeTools } from "./tools/event-types";
import { registerScheduleTools } from "./tools/schedules";
import { registerFormTools } from "./tools/forms";
import { registerWorkflowTools } from "./tools/workflows";

const { schema } = dbSchema;

// ─── Props ───────────────────────────────────────────────────────────────────
// Set by the /api/mcp route in worker/index.ts after validating the API key.
// projectId hard-scopes every tool in the session — it is never a tool param.

export interface McpProps extends Record<string, unknown> {
  projectId: string;
}

// ─── Tool Context ────────────────────────────────────────────────────────────
// Accessors instead of values so each tool call gets a fresh drizzle instance
// (matches the services-instantiated-per-request convention) and props are
// read at call time, after the DO has hydrated them.

export interface ToolContext {
  projectId: () => string;
  db: () => DrizzleD1Database<Record<string, unknown>>;
  env: () => AppEnv;
  waitUntil: (p: Promise<unknown>) => void;
}

// ─── Agent ───────────────────────────────────────────────────────────────────

export class LinkyCalMcp extends McpAgent<Cloudflare.Env & AppEnv, unknown, McpProps> {
  server = new McpServer({ name: "linkycal", version: "1.0.0" });

  async init() {
    const ctx: ToolContext = {
      projectId: () => {
        const projectId = this.props?.projectId;
        if (!projectId) throw new Error("MCP session is missing projectId");
        return projectId;
      },
      db: () => drizzle(this.env.DB, { schema }),
      env: () => this.env,
      // The DO stays alive while the event completes, so fire-and-forget with
      // error logging is safe here (no ExecutionContext.waitUntil in a DO).
      waitUntil: (p) => {
        void p.catch((err) => console.error("MCP background task failed:", err));
      },
    };

    registerBookingTools(this.server, ctx);
    registerContactTools(this.server, ctx);
    registerEventTypeTools(this.server, ctx);
    registerScheduleTools(this.server, ctx);
    registerFormTools(this.server, ctx);
    registerWorkflowTools(this.server, ctx);
  }
}
