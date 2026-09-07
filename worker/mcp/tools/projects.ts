import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  deleteCustomCssAction,
  getCustomCssAction,
  getProjectAction,
  getProjectEntitlementsAction,
  setCustomCssAction,
  updateProjectAction,
} from "../../lib/project-actions";
import { customCssSchema, updateProjectSchema } from "../../validation";
import type { ToolContext } from "../agent";
import { actionToMcpResult } from "../action-result";
import { withMcpToolDiscovery } from "../tool-discovery";
import { withToolErrors } from "../helpers";
import { projectSlugOutputSchema } from "../slug-schema";
import type { ProjectActionDeps } from "../../lib/action-result";

function projectActionDeps(ctx: ToolContext): ProjectActionDeps {
  return {
    db: ctx.db(),
    env: ctx.env(),
    projectId: ctx.projectId(),
    channel: "mcp",
    waitUntil: ctx.waitUntil,
  };
}

// ─── Handlers ───────────────────────────────────────────────────────────────

export async function getProject(ctx: ToolContext) {
  return actionToMcpResult(await getProjectAction(projectActionDeps(ctx)));
}

export async function getProjectEntitlements(ctx: ToolContext) {
  return actionToMcpResult(await getProjectEntitlementsAction(projectActionDeps(ctx)));
}

export async function updateProject(
  ctx: ToolContext,
  input: z.infer<typeof updateProjectSchema>,
) {
  return actionToMcpResult(await updateProjectAction(projectActionDeps(ctx), input));
}

export async function getCustomCss(ctx: ToolContext) {
  return actionToMcpResult(await getCustomCssAction(projectActionDeps(ctx)));
}

export async function setCustomCss(
  ctx: ToolContext,
  input: z.infer<typeof customCssSchema>,
) {
  return actionToMcpResult(await setCustomCssAction(projectActionDeps(ctx), input));
}

export async function deleteCustomCss(ctx: ToolContext) {
  return actionToMcpResult(await deleteCustomCssAction(projectActionDeps(ctx)));
}

// ─── Registration ───────────────────────────────────────────────────────────

const updateShape = updateProjectSchema.shape;
const customCssShape = customCssSchema.shape;

export function registerProjectTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "get_project",
    withMcpToolDiscovery("get_project", {
      description: "Get the project bound to this MCP connection.",
      inputSchema: {},
      outputSchema: projectSlugOutputSchema,
    }),
    withToolErrors("get_project", ctx, () => getProject(ctx)),
  );

  server.registerTool(
    "get_project_entitlements",
    withMcpToolDiscovery("get_project_entitlements", {
      description: "Get this project's plan, limits, usage, and entitlement decisions.",
      inputSchema: {},
    }),
    withToolErrors("get_project_entitlements", ctx, () => getProjectEntitlements(ctx)),
  );

  server.registerTool(
    "update_project",
    withMcpToolDiscovery("update_project", {
      description: "Update project details. Only provided fields change.",
      outputSchema: projectSlugOutputSchema,
      inputSchema: {
        name: updateShape.name.describe("Project name"),
        slug: updateShape.slug.describe("Public URL slug"),
        timezone: updateShape.timezone.describe("IANA timezone"),
        onboarded: updateShape.onboarded.describe("Whether onboarding is complete"),
        settings: updateShape.settings.describe("Project settings to merge"),
      },
    }),
    withToolErrors("update_project", ctx, (input) => updateProject(ctx, input)),
  );

  server.registerTool(
    "get_custom_css",
    withMcpToolDiscovery("get_custom_css", {
      description: "Get this project's saved Custom CSS source and metadata.",
      inputSchema: {},
    }),
    withToolErrors("get_custom_css", ctx, () => getCustomCss(ctx)),
  );

  server.registerTool(
    "set_custom_css",
    withMcpToolDiscovery("set_custom_css", {
      description: "Validate and save scoped Custom CSS for this project.",
      inputSchema: { css: customCssShape.css.describe("CSS source, up to 20 KB") },
    }),
    withToolErrors("set_custom_css", ctx, (input) => setCustomCss(ctx, input)),
  );

  server.registerTool(
    "delete_custom_css",
    withMcpToolDiscovery("delete_custom_css", {
      description: "Delete this project's saved Custom CSS.",
      inputSchema: {},
    }),
    withToolErrors("delete_custom_css", ctx, () => deleteCustomCss(ctx)),
  );
}
