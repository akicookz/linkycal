import { eq } from "drizzle-orm";

import * as dbSchema from "../db/schema";
import { EntitlementService } from "../services/entitlement-service";
import {
  ProjectStorageUnavailableError,
  StorageUsageService,
} from "../services/storage-usage-service";
import {
  actionCreated,
  actionError,
  actionNotFound,
  actionOk,
} from "./action-result";
import { entitlementError } from "./entitlement-errors";
import type { ActionErrorBody, ActionResult, ProjectActionDeps } from "./action-result";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export interface UploadProjectAssetInput {
  filename: string;
  contentType: keyof typeof IMAGE_EXTENSIONS;
  sizeBytes: number;
  bytes: Uint8Array;
}

async function projectIsActive(deps: ProjectActionDeps): Promise<boolean> {
  if (deps.projectScope && deps.projectScope.projectId !== deps.projectId) {
    return false;
  }
  const [project] = await deps.db
    .select({ id: dbSchema.projects.id, deletingAt: dbSchema.projects.deletingAt })
    .from(dbSchema.projects)
    .where(eq(dbSchema.projects.id, deps.projectId))
    .limit(1);
  return !!project && !project.deletingAt;
}

function assetValidationError<T>(message: string): ActionResult<T> {
  return actionError(400, message);
}

function assetExtension(contentType: string): string | null {
  return IMAGE_EXTENSIONS[contentType as keyof typeof IMAGE_EXTENSIONS] ?? null;
}

// ─── Project assets ─────────────────────────────────────────────────────────

export async function uploadProjectAssetAction(
  deps: ProjectActionDeps,
  input: UploadProjectAssetInput,
): Promise<ActionResult<{ key: string; url: string }>> {
  if (!input.filename.trim()) return assetValidationError("Filename is required");
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0) {
    return assetValidationError("Invalid file size");
  }
  const extension = assetExtension(input.contentType);
  if (!extension) {
    return assetValidationError("Invalid file type. Allowed: JPEG, PNG, WebP, GIF");
  }
  if (input.sizeBytes !== input.bytes.byteLength) {
    return assetValidationError("File size does not match uploaded data");
  }
  if (input.sizeBytes > MAX_IMAGE_SIZE) {
    return assetValidationError("File too large. Maximum 5MB");
  }
  if (!(await projectIsActive(deps))) {
    const [project] = await deps.db
      .select({ id: dbSchema.projects.id })
      .from(dbSchema.projects)
      .where(eq(dbSchema.projects.id, deps.projectId))
      .limit(1);
    return project ? actionError(409, "Project deletion is in progress") : actionNotFound("Project");
  }

  const entitlements = await new EntitlementService(deps.db).resolveProject(
    deps.projectId,
  );
  if (!entitlements) return actionNotFound("Project");

  const key = `projects/${deps.projectId}/${crypto.randomUUID()}.${extension}`;
  const storage = new StorageUsageService(deps.db);
  const decision = await storage.reserve({
    workspace: entitlements.workspace,
    plan: entitlements.subscription.plan,
    objectKey: key,
    sizeBytes: input.sizeBytes,
    env: deps.env,
    projectId: deps.projectId,
    channel: "project_upload",
  });
  if (!decision.allowed) {
    const failure = entitlementError(decision, "upload this file");
    return {
      ok: false,
      status: failure.status,
      body: failure.body as unknown as ActionErrorBody,
      headers: failure.headers,
    };
  }

  try {
    await deps.env.UPLOADS.put(key, input.bytes, {
      httpMetadata: { contentType: input.contentType },
    });
    await storage.commit({
      workspace: entitlements.workspace,
      projectId: deps.projectId,
      objectKey: key,
      category: "project_asset",
      sizeBytes: input.sizeBytes,
    });
  } catch (error) {
    try {
      await deps.env.UPLOADS.delete(key);
    } catch (cleanupError) {
      console.error("Failed to clean up rejected project upload:", cleanupError);
    } finally {
      await storage.releaseFailed(entitlements.workspace, key);
    }
    if (error instanceof ProjectStorageUnavailableError) {
      return actionError(409, error.message);
    }
    console.error("Project asset upload failed:", error);
    return actionError(500, "Failed to upload file");
  }

  return actionCreated({ key, url: `/api/uploads/${key}` });
}

export async function deleteProjectAssetAction(
  deps: ProjectActionDeps,
  key: string,
): Promise<ActionResult<{ success: true }>> {
  if (!key.startsWith(`projects/${deps.projectId}/`)) {
    return actionNotFound("Upload");
  }
  const entitlements = await new EntitlementService(deps.db).resolveProject(
    deps.projectId,
  );
  if (!entitlements) return actionNotFound("Project");
  await deps.env.UPLOADS.delete(key);
  await new StorageUsageService(deps.db).remove(entitlements.workspace, key);
  return actionOk({ success: true });
}
