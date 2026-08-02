import type { DrizzleD1Database } from "drizzle-orm/d1";

import { resolveProjectEntitlements } from "../lib/entitlements";
import {
  hasProjectPermission,
  resolveProjectAccess,
} from "../lib/team-access";
import { McpOAuthGrantService } from "../services/mcp-oauth-grant-service";
import type { McpOAuthProps } from "./oauth-authorization";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

export type McpAccessResult =
  | { allowed: true; props: McpOAuthProps }
  | { allowed: false; status: 403; error: string };

export async function authorizeMcpRequest(
  db: AppDatabase,
  props: McpOAuthProps,
  origin: string | null,
  trustedOrigins: Set<string>,
): Promise<McpAccessResult> {
  if (origin && !trustedOrigins.has(origin)) {
    return {
      allowed: false,
      status: 403,
      error: "MCP request Origin is not allowed",
    };
  }

  const connection = await new McpOAuthGrantService(db).getActive(
    props.connectionId,
  );
  if (!connection || connection.projectId !== props.projectId) {
    return {
      allowed: false,
      status: 403,
      error: "MCP connection is no longer active",
    };
  }

  const access = await resolveProjectAccess(db, props.projectId, props.userId);
  if (!access || !hasProjectPermission(access, "project:api_keys")) {
    return {
      allowed: false,
      status: 403,
      error: "MCP project access is no longer authorized",
    };
  }

  const entitlements = await resolveProjectEntitlements(db, props.projectId);
  if (!entitlements?.planLimits.apiAccess) {
    return {
      allowed: false,
      status: 403,
      error: "MCP API access is not available on this plan",
    };
  }

  return { allowed: true, props };
}
