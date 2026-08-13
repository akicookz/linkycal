import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  deleteProjectAssetAction,
  uploadProjectAssetAction,
} from "../../lib/project-asset-actions";
import { projectAssetSchema } from "../../validation";
import type { ProjectActionDeps } from "../../lib/action-result";
import type { ToolContext } from "../agent";
import { actionToMcpResult } from "../action-result";
import { err, withToolErrors } from "../helpers";
import { withMcpToolDiscovery } from "../tool-discovery";

function projectActionDeps(ctx: ToolContext): ProjectActionDeps {
  return {
    db: ctx.db(),
    env: ctx.env(),
    projectId: ctx.projectId(),
    channel: "mcp",
    waitUntil: ctx.waitUntil,
  };
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const decoded = atob(value);
    return Uint8Array.from(decoded, function toByte(char) {
      return char.charCodeAt(0);
    });
  } catch {
    return null;
  }
}

// ─── Handlers ───────────────────────────────────────────────────────────────

export async function uploadProjectAsset(
  ctx: ToolContext,
  input: z.infer<typeof projectAssetSchema>,
) {
  const bytes = decodeBase64(input.dataBase64);
  if (!bytes) return err("Invalid input: dataBase64 must be valid base64");
  return actionToMcpResult(
    await uploadProjectAssetAction(projectActionDeps(ctx), {
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: bytes.byteLength,
      bytes,
    }),
  );
}

export async function deleteProjectAsset(
  ctx: ToolContext,
  input: { key: string },
) {
  return actionToMcpResult(
    await deleteProjectAssetAction(projectActionDeps(ctx), input.key),
  );
}

// ─── Registration ───────────────────────────────────────────────────────────

const assetShape = projectAssetSchema.shape;

export function registerProjectAssetTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "upload_project_asset",
    withMcpToolDiscovery("upload_project_asset", {
      description: "Upload a JPEG, PNG, WebP, or GIF image asset for this project.",
      inputSchema: {
        filename: assetShape.filename.describe("Original filename"),
        contentType: assetShape.contentType.describe("Image MIME type"),
        dataBase64: assetShape.dataBase64.describe("Image bytes encoded as base64"),
      },
    }),
    withToolErrors("upload_project_asset", ctx, (input) => uploadProjectAsset(ctx, input)),
  );

  server.registerTool(
    "delete_project_asset",
    withMcpToolDiscovery("delete_project_asset", {
      description: "Delete a project asset by its key.",
      inputSchema: { key: z.string().min(1).describe("Asset key returned by upload_project_asset") },
    }),
    withToolErrors("delete_project_asset", ctx, (input) => deleteProjectAsset(ctx, input)),
  );
}
