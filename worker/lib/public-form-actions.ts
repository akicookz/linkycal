import type { DrizzleD1Database } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";

import * as dbSchema from "../db/schema";
import { FormService } from "../services/form-service";
import {
  AnalyticsIntegrationService,
  stripAnalyticsIntegrationsFromSettings,
} from "../services/analytics-integration-service";
import { submitFormStepSchema } from "../validation";
import { resolveProjectEntitlements } from "./entitlements";

type AppDatabase = DrizzleD1Database<Record<string, unknown>>;

export async function loadPublicFormAction(
  db: AppDatabase,
  projectSlug: string,
  formSlug: string,
) {
  const [project] = await db
    .select({
      id: dbSchema.projects.id,
      name: dbSchema.projects.name,
      slug: dbSchema.projects.slug,
      settings: dbSchema.projects.settings,
    })
    .from(dbSchema.projects)
    .where(eq(dbSchema.projects.slug, projectSlug))
    .limit(1);

  if (!project) {
    return {
      ok: false as const,
      status: 404 as const,
      body: { error: "Form not found" },
    };
  }

  const form = await new FormService(db).getFullFormBySlug(
    project.id,
    formSlug,
  );
  if (!form || form.status !== "active") {
    return {
      ok: false as const,
      status: 404 as const,
      body: { error: "Form not found" },
    };
  }

  const entitlements = await resolveProjectEntitlements(db, project.id);
  const canHideBranding =
    entitlements?.subscription.plan === "pro" ||
    entitlements?.subscription.plan === "business";
  const analyticsIntegrations = await new AnalyticsIntegrationService(
    db,
  ).getPublished(project.id);

  return {
    ok: true as const,
    status: 200 as const,
    body: {
      form,
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        settings: stripAnalyticsIntegrationsFromSettings(project.settings),
      },
      canHideBranding,
      analyticsIntegrations,
    },
  };
}

export async function submitPublicFormStepAction(
  db: AppDatabase,
  responseId: string,
  stepIndex: number,
  rawBody: unknown,
) {
  const parsed = submitFormStepSchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      ok: false as const,
      status: 400 as const,
      body: { error: "Invalid request" },
    };
  }

  const response = await new FormService(db).submitStep(
    responseId,
    stepIndex,
    parsed.data.fields,
    {
      complete: parsed.data.complete === true,
      clearedFieldIds: parsed.data.clearedFieldIds,
    },
  );
  if (!response) {
    return {
      ok: false as const,
      status: 404 as const,
      body: { error: "Response not found" },
    };
  }

  return {
    ok: true as const,
    status: 200 as const,
    body: { response },
    analytics: parsed.data.analytics,
  };
}
