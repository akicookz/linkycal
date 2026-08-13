import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import * as dbSchema from "../db/schema";
import {
  CustomCssEntitlementError,
  CustomCssService,
} from "../services/custom-css-service";
import { EntitlementService } from "../services/entitlement-service";
import {
  customCssSchema,
  updateProjectSchema,
  validate,
} from "../validation";
import {
  mergeProjectSettingsPreservingAnalyticsIntegrations,
} from "../services/analytics-integration-service";
import {
  actionError,
  actionNotFound,
  actionOk,
} from "./action-result";
import { entitlementError } from "./entitlement-errors";
import type { ActionErrorBody, ActionResult, ProjectActionDeps } from "./action-result";

type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

// ─── Project helpers ────────────────────────────────────────────────────────

async function projectForAction(
  deps: ProjectActionDeps,
): Promise<dbSchema.ProjectRow | null> {
  if (deps.projectScope && deps.projectScope.projectId !== deps.projectId) {
    return null;
  }
  const [project] = await deps.db
    .select()
    .from(dbSchema.projects)
    .where(eq(dbSchema.projects.id, deps.projectId))
    .limit(1);
  return project ?? null;
}

function normalizeProject(project: dbSchema.ProjectRow) {
  let settings: Record<string, unknown> = {};
  if (project.settings) {
    try {
      const parsed = JSON.parse(project.settings);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        settings = parsed as Record<string, unknown>;
      }
    } catch {
      // Legacy malformed settings should not make an otherwise readable project
      // unavailable. The next valid settings update repairs the representation.
    }
  }
  return { ...project, settings };
}

function actionValidationError<T>(error: unknown): ActionResult<T> {
  if (error instanceof z.ZodError) return actionError(400, "Invalid request");
  if (error instanceof Error) return actionError(400, error.message);
  return actionError(400, "Invalid request");
}

// ─── Project ────────────────────────────────────────────────────────────────

export async function getProjectAction(
  deps: ProjectActionDeps,
): Promise<ActionResult<ReturnType<typeof normalizeProject>>> {
  const project = await projectForAction(deps);
  if (!project) return actionNotFound("Project");
  return actionOk(normalizeProject(project));
}

export async function updateProjectAction(
  deps: ProjectActionDeps,
  body: unknown,
): Promise<ActionResult<ReturnType<typeof normalizeProject>>> {
  let data: UpdateProjectInput;
  try {
    data = validate(updateProjectSchema, body);
  } catch (error) {
    return actionValidationError(error);
  }

  const project = await projectForAction(deps);
  if (!project) return actionNotFound("Project");

  const values: Record<string, unknown> = {};
  let renamedFromSlug: string | null = null;
  if (data.name !== undefined) values.name = data.name;
  if (data.slug !== undefined) {
    const [clash] = await deps.db
      .select({ id: dbSchema.projects.id })
      .from(dbSchema.projects)
      .where(
        and(
          eq(dbSchema.projects.slug, data.slug),
          ne(dbSchema.projects.id, deps.projectId),
        ),
      )
      .limit(1);
    if (clash) return actionError(409, "Slug is already taken");
    if (project.slug !== data.slug) renamedFromSlug = project.slug;
    values.slug = data.slug;
  }
  if (data.timezone !== undefined) values.timezone = data.timezone;
  if (data.onboarded !== undefined) values.onboarded = data.onboarded;
  if (data.settings !== undefined) {
    values.settings = JSON.stringify(
      mergeProjectSettingsPreservingAnalyticsIntegrations(
        project.settings,
        data.settings,
      ),
    );
  }
  if (Object.keys(values).length === 0) {
    return actionError(400, "No fields to update");
  }

  await deps.db
    .update(dbSchema.projects)
    .set(values)
    .where(eq(dbSchema.projects.id, deps.projectId));

  if (renamedFromSlug) {
    try {
      await deps.db
        .insert(dbSchema.projectSlugHistory)
        .values({
          id: crypto.randomUUID(),
          projectId: deps.projectId,
          slug: renamedFromSlug,
        })
        .onConflictDoUpdate({
          target: dbSchema.projectSlugHistory.slug,
          set: { projectId: deps.projectId, createdAt: new Date() },
        });
      await deps.db
        .delete(dbSchema.projectSlugHistory)
        .where(eq(dbSchema.projectSlugHistory.slug, data.slug!));
    } catch (error) {
      console.error("Project slug history recording failed:", error);
    }
  }

  const [updated] = await deps.db
    .select()
    .from(dbSchema.projects)
    .where(eq(dbSchema.projects.id, deps.projectId))
    .limit(1);
  if (!updated) return actionNotFound("Project");
  return actionOk(normalizeProject(updated));
}

export async function getProjectEntitlementsAction(
  deps: ProjectActionDeps,
): Promise<ActionResult<Awaited<ReturnType<EntitlementService["snapshot"]>>>> {
  const project = await projectForAction(deps);
  if (!project) return actionNotFound("Project");
  const snapshot = await new EntitlementService(deps.db).snapshot(
    deps.projectId,
    deps.actorUserId,
  );
  if (!snapshot) return actionNotFound("Project");
  return actionOk(snapshot);
}

// ─── Custom CSS ─────────────────────────────────────────────────────────────

function customCssSettings(css: dbSchema.ProjectCustomCssRow | null) {
  return {
    customCss: css
      ? {
          sourceCss: css.sourceCss,
          sourceBytes: css.sourceBytes,
          updatedAt: css.updatedAt,
        }
      : null,
  };
}

export async function getCustomCssAction(
  deps: ProjectActionDeps,
): Promise<ActionResult<ReturnType<typeof customCssSettings>>> {
  const project = await projectForAction(deps);
  if (!project) return actionNotFound("Project");
  const css = await new CustomCssService(deps.db).getForSettings(deps.projectId);
  return actionOk(customCssSettings(css));
}

export async function setCustomCssAction(
  deps: ProjectActionDeps,
  body: unknown,
): Promise<ActionResult<ReturnType<typeof customCssSettings>>> {
  let data: z.infer<typeof customCssSchema>;
  try {
    data = validate(customCssSchema, body);
  } catch (error) {
    return actionValidationError(error);
  }
  const project = await projectForAction(deps);
  if (!project) return actionNotFound("Project");

  try {
    const saved = await new CustomCssService(deps.db).save(
      deps.projectId,
      data.css,
      deps.actorUserId ?? deps.projectScope?.ownerUserId ?? project.userId,
      deps.env,
    );
    return actionOk(customCssSettings(saved));
  } catch (error) {
    if (error instanceof CustomCssEntitlementError) {
      const failure = entitlementError(error.decision, "save Custom CSS");
      return {
        ok: false,
        status: failure.status,
        body: failure.body as unknown as ActionErrorBody,
        headers: failure.headers,
      };
    }
    return actionValidationError(error);
  }
}

export async function deleteCustomCssAction(
  deps: ProjectActionDeps,
): Promise<ActionResult<{ success: true }>> {
  const project = await projectForAction(deps);
  if (!project) return actionNotFound("Project");
  await new CustomCssService(deps.db).remove(deps.projectId);
  return actionOk({ success: true });
}
